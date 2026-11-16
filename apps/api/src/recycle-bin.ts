import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  ValidationPipe,
} from "@nestjs/common";
import { Prisma, type AuditLog } from "@prisma/client";
import { Equals } from "class-validator";
import type { AuthRequest } from "./auth";
import { DatabaseService } from "./database.service";
import { lockBinEntry } from "./recycle-state";
import { restoreDeletedSupplier } from "./suppliers";
import { lockProducts, reverseJournal } from "./transaction-cancellation";

class ConfirmDto {
  @Equals(true) confirmed!: boolean;
}
const validation = new ValidationPipe({
  expectedType: ConfirmDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const actions = ["SUPPLIER_DELETED", "SALE_CANCELLED", "PURCHASE_CANCELLED"];
type Tx = Prisma.TransactionClient;
type Snapshot = {
  invoiceNumber?: string;
  number?: string;
  stockReversalPostingId?: string;
  paymentReversalIds?: string[];
  costAllocationIds?: string[];
  saleUnitIds?: string[];
  supplier?: { name: string; phone: string | null; company: string | null };
};
function allowed(req: AuthRequest, type: string) {
  const p = req.currentUser!.permissions;
  return type === "Supplier"
    ? p.includes("parties.suppliers")
    : p.includes("transactions.reverse") &&
        p.includes(type === "Sale" ? "sales.manage" : "purchases.manage");
}

async function restorePosting(
  tx: Tx,
  postingId: string,
  entry: AuditLog,
  actorId: string,
) {
  const original = await tx.posting.findUniqueOrThrow({
    where: { id: postingId },
    include: {
      movements: { include: { reversals: true } },
      journal: { include: { reversal: true } },
    },
  });
  const cancelled = original.movements.map((m) => m.reversals);
  if (!cancelled.length || cancelled.some((m) => !m))
    throw new ConflictException(
      "The stock correction is incomplete; restore cannot proceed.",
    );
  const reversalIds = cancelled.map((m) => m!.id);
  if (
    await tx.stockMovement.count({
      where: { reversedMovementId: { in: reversalIds } },
    })
  )
    throw new ConflictException("Stock has already been corrected again.");
  const reason = "Restore " + entry.resourceType + " from Recycle Bin";
  const posting = await tx.posting.create({
    data: {
      actorId,
      kind: "TRANSACTION_RESTORED",
      sourceCode: "restore:" + entry.id,
      reason,
    },
  });
  await tx.stockMovement.createMany({
    data: cancelled.map((m, index) => ({
      postingId: posting.id,
      lineNumber: index + 1,
      productId: m!.productId,
      batchId: m!.batchId,
      batteryUnitId: m!.batteryUnitId,
      quantity: m!.quantity,
      reversedMovementId: m!.id,
      fromCustody: m!.toCustody,
      toCustody: m!.fromCustody,
      fromState: m!.toState,
      toState: m!.fromState,
      fromCondition: m!.toCondition,
      toCondition: m!.fromCondition,
      fromOwnership: m!.toOwnership,
      toOwnership: m!.fromOwnership,
      reason,
    })),
  });
  if (original.journal) {
    const reversal = original.journal.reversal;
    if (!reversal)
      throw new ConflictException("Financial correction is missing.");
    const lines = await tx.journalLine.findMany({
      where: { entryId: reversal.id },
    });
    await tx.journalEntry.create({
      data: {
        postingId: posting.id,
        reason,
        reversedEntryId: reversal.id,
        lines: {
          create: lines.map((l) => ({
            accountId: l.accountId,
            customerId: l.customerId,
            supplierId: l.supplierId,
            debit: l.credit,
            credit: l.debit,
          })),
        },
      },
    });
  }
  return posting.id;
}

async function restorePayments(
  tx: Tx,
  target: { saleId: string } | { purchaseReceiptId: string },
  entry: AuditLog,
  actorId: string,
) {
  const snapshot = entry.metadata as Snapshot | null;
  // Older cancellations did not record the refund IDs. Their unreversed refunds
  // are still unambiguous because the transaction has remained cancelled.
  const refunds = await tx.payment.findMany({
    where: {
      ...(snapshot?.paymentReversalIds
        ? { id: { in: snapshot.paymentReversalIds } }
        : {
            allocations: { some: target },
            reversedPaymentId: { not: null },
            journal: { reversal: { is: null } },
          }),
    },
    include: { allocations: true },
  });
  for (const refund of refunds) {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${refund.id}::uuid FOR UPDATE`;
    const journal = await reverseJournal(
      tx,
      refund.journalId,
      actorId,
      "restore-payment:" + refund.id,
      "Restore payment from Recycle Bin",
      new Date(),
    );
    await tx.payment.create({
      data: {
        number: "RST-" + refund.id,
        direction: refund.direction === "INCOMING" ? "OUTGOING" : "INCOMING",
        amount: refund.amount,
        occurredAt: new Date(),
        method: refund.method,
        customerId: refund.customerId,
        supplierId: refund.supplierId,
        assetAccountId: refund.assetAccountId,
        journalId: journal!.id,
        allocations: {
          create: refund.allocations.map((a) => ({
            saleId: a.saleId,
            purchaseReceiptId: a.purchaseReceiptId,
            amount: a.amount,
          })),
        },
      },
    });
  }
}

async function restoreSale(tx: Tx, entry: AuditLog, actorId: string) {
  const id = entry.resourceId!;
  await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${id}::uuid FOR UPDATE`;
  const sale = await tx.sale.findUniqueOrThrow({
    where: { id },
    include: { customer: true, items: { include: { product: true } } },
  });
  if (sale.status !== "CANCELLED" || !sale.postingId)
    throw new ConflictException("This sale is no longer deleted.");
  if (!sale.customer.active || sale.items.some((i) => !i.product.active))
    throw new ConflictException(
      "Activate the customer and products before restoring this sale.",
    );
  await lockProducts(
    tx,
    sale.items.map((i) => i.productId),
  );
  const snapshot = entry.metadata as Snapshot | null;
  const allocations = await tx.costAllocation.findMany({
    where: snapshot?.costAllocationIds
      ? { id: { in: snapshot.costAllocationIds } }
      : { saleItem: { saleId: id }, reversedAllocationId: null },
    include: { reversals: true },
  });
  const units = await tx.saleUnit.findMany({
    where: snapshot?.saleUnitIds
      ? { id: { in: snapshot.saleUnitIds } }
      : { saleItem: { saleId: id } },
  });
  for (const item of sale.items) {
    if (
      !allocations
        .filter((a) => a.saleItemId === item.id)
        .reduce((s, a) => s.add(a.quantity), new Prisma.Decimal(0))
        .equals(item.quantity)
    )
      throw new ConflictException("Original stock allocations are incomplete.");
  }
  for (const allocation of allocations) {
    if (!allocation.reversals)
      throw new ConflictException("Stock allocation correction is missing.");
    if (!allocation.batteryUnitId) {
      const changed = await tx.inventoryBalance.updateMany({
        where: {
          batchId: allocation.batchId,
          location: "SHOP",
          bucket: "AVAILABLE",
          quantity: { gte: allocation.quantity },
        },
        data: { quantity: { decrement: allocation.quantity } },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          "The original stock is unavailable. Restore the purchase or replenish its batch before restoring this sale.",
        );
    }
    await tx.costAllocation.create({
      data: {
        saleItemId: allocation.saleItemId,
        batchId: allocation.batchId,
        batteryUnitId: allocation.batteryUnitId,
        quantity: allocation.quantity,
        unitCost: allocation.unitCost,
        cogs: allocation.cogs,
      },
    });
  }
  for (const unit of units) {
    if (
      !unit.releasedAt ||
      (await tx.saleUnit.count({
        where: { batteryUnitId: unit.batteryUnitId, releasedAt: null },
      }))
    )
      throw new ConflictException(
        "An original battery has already been sold again.",
      );
    const changed = await tx.batteryUnit.updateMany({
      where: {
        id: unit.batteryUnitId,
        condition: "GOOD",
        custody: "SHOP",
        ownership: "SHOP",
        commercialState: "AVAILABLE",
        reservedCustomerId: null,
        reservedReplacementId: null,
      },
      data: {
        custody: "CUSTOMER",
        ownership: "CUSTOMER",
        commercialState: "SOLD",
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1)
      throw new ConflictException(
        "An original battery is unavailable. Restore its purchase first or release its reservation.",
      );
    await tx.saleUnit.create({
      data: {
        saleItemId: unit.saleItemId,
        batteryUnitId: unit.batteryUnitId,
        batterySetId: unit.batterySetId,
        coverageStart: unit.coverageStart,
        coverageExpiry: unit.coverageExpiry,
        costAtSale: unit.costAtSale,
      },
    });
  }
  const postingId = await restorePosting(tx, sale.postingId, entry, actorId);
  await restorePayments(tx, { saleId: id }, entry, actorId);
  await tx.sale.update({
    where: { id },
    data: { postingId, status: "CONFIRMED", version: { increment: 1 } },
  });
}

async function restorePurchase(tx: Tx, entry: AuditLog, actorId: string) {
  const id = entry.resourceId!;
  await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id=${id}::uuid FOR UPDATE`;
  const purchase = await tx.purchase.findUniqueOrThrow({
    where: { id },
    include: {
      supplier: true,
      items: true,
      receipts: {
        include: {
          items: {
            include: {
              batch: {
                include: {
                  product: { include: { type: true } },
                  batteryUnits: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (purchase.status !== "CANCELLED" || purchase.receipts.length !== 1)
    throw new ConflictException("This purchase is no longer deleted.");
  if (!purchase.supplier.active)
    throw new ConflictException(
      "Activate the supplier before restoring this purchase.",
    );
  await lockProducts(
    tx,
    purchase.items.map((i) => i.productId),
  );
  const receipt = purchase.receipts[0];
  for (const item of receipt.items) {
    const batch = item.batch;
    if (!batch || !batch.product.active)
      throw new ConflictException(
        "The original product or stock batch is unavailable.",
      );
    if (batch.product.type.trackingKind === "BATTERY_UNIT") {
      const changed = await tx.batteryUnit.updateMany({
        where: {
          batchId: batch.id,
          condition: "GOOD",
          custody: "DISPOSED",
          ownership: "DISPOSED",
          commercialState: "RETIRED",
          reservedCustomerId: null,
          reservedReplacementId: null,
        },
        data: {
          custody: "SHOP",
          ownership: "SHOP",
          commercialState: "AVAILABLE",
          version: { increment: 1 },
        },
      });
      if (!batch.originalQuantity.equals(changed.count))
        throw new ConflictException(
          "Original batteries have changed; purchase restore cannot proceed.",
        );
    } else {
      const balances = await tx.inventoryBalance.findMany({
        where: { batchId: batch.id },
      });
      if (balances.some((b) => !b.quantity.isZero()))
        throw new ConflictException(
          "Original stock has changed; purchase restore cannot proceed.",
        );
      const changed = await tx.inventoryBalance.updateMany({
        where: {
          batchId: batch.id,
          location: "SHOP",
          bucket: "AVAILABLE",
          quantity: 0,
        },
        data: { quantity: batch.originalQuantity },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          "Original stock balance changed or is missing. Refresh and try again.",
        );
    }
  }
  const postingId = await restorePosting(tx, receipt.postingId, entry, actorId);
  await restorePayments(tx, { purchaseReceiptId: receipt.id }, entry, actorId);
  await tx.purchaseReceipt.update({
    where: { id: receipt.id },
    data: { postingId },
  });
  await tx.purchase.update({
    where: { id },
    data: { status: "RECEIVED", version: { increment: 1 } },
  });
}

@Controller("recycle-bin")
export class RecycleBinController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  async list(@Req() req: AuthRequest) {
    const entries = await this.db.auditLog.findMany({
      where: {
        action: {
          in: [
            ...actions,
            "SUPPLIER_RESTORED",
            "RECYCLE_BIN_RESTORED",
            "RECYCLE_BIN_FINALIZED",
          ],
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const resolved = new Set(
      entries.flatMap((e) => {
        const m = e.metadata as {
          entryId?: string;
          deletionId?: string;
        } | null;
        return actions.includes(e.action) ? [] : [m?.entryId, m?.deletionId];
      }),
    );
    const seen = new Set<string>();
    const data = [];
    for (const entry of entries) {
      if (
        !actions.includes(entry.action) ||
        !entry.resourceId ||
        !allowed(req, entry.resourceType)
      )
        continue;
      const key = entry.resourceType + entry.resourceId;
      if (seen.has(key)) continue;
      seen.add(key);
      if (resolved.has(entry.id)) continue;
      const m = entry.metadata as Snapshot | null;
      let name = "",
        party: string | null = null,
        amount: string | null = null;
      if (entry.resourceType === "Supplier") {
        if (
          !m?.supplier ||
          (await this.db.supplier.findUnique({
            where: { id: entry.resourceId },
            select: { id: true },
          }))
        )
          continue;
        name = m.supplier.name;
        party = m.supplier.company;
      } else if (entry.resourceType === "Sale") {
        const sale = await this.db.sale.findUnique({
          where: { id: entry.resourceId },
          include: { customer: true },
        });
        if (sale?.status !== "CANCELLED") continue;
        name = sale.invoiceNumber || sale.id;
        party = sale.customer.name;
        amount = sale.total.toFixed(2);
      } else if (entry.resourceType === "Purchase") {
        const purchase = await this.db.purchase.findUnique({
          where: { id: entry.resourceId },
          include: { supplier: true, items: true },
        });
        if (purchase?.status !== "CANCELLED") continue;
        name = purchase.number;
        party = purchase.supplier.name;
        amount = purchase.items
          .reduce(
            (sum, i) => sum.add(i.quantity.mul(i.unitPrice)),
            new Prisma.Decimal(0),
          )
          .sub(purchase.discount)
          .add(purchase.additionalCosts)
          .toFixed(2);
      } else continue;
      data.push({
        id: entry.id,
        name,
        type: entry.resourceType,
        party,
        amount,
        deletedAt: entry.createdAt,
      });
    }
    return { data };
  }

  @Post(":entryId/restore")
  restore(
    @Param("entryId", ParseUUIDPipe) entryId: string,
    @Body(validation) _body: ConfirmDto,
    @Req() req: AuthRequest,
  ) {
    return this.resolve(entryId, req, false);
  }

  @Delete(":entryId")
  finalize(
    @Param("entryId", ParseUUIDPipe) entryId: string,
    @Body(validation) _body: ConfirmDto,
    @Req() req: AuthRequest,
  ) {
    return this.resolve(entryId, req, true);
  }

  private async resolve(entryId: string, req: AuthRequest, final: boolean) {
    return {
      data: await this.db.$transaction(
        async (tx) => {
          await lockBinEntry(tx, entryId);
          const entry = await tx.auditLog.findUnique({
            where: { id: entryId },
          });
          if (!entry?.resourceId || !actions.includes(entry.action))
            throw new NotFoundException("Deleted item not found.");
          if (!allowed(req, entry.resourceType))
            throw new ForbiddenException(
              "You do not have permission to change this deleted item.",
            );
          const latest = await tx.auditLog.findFirst({
            where: {
              resourceType: entry.resourceType,
              resourceId: entry.resourceId,
              action: entry.action,
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          });
          if (latest?.id !== entry.id)
            throw new ConflictException(
              "This deletion is outdated. Refresh the Recycle Bin.",
            );
          if (!final) {
            if (entry.resourceType === "Supplier")
              await restoreDeletedSupplier(tx, entryId, req);
            else if (entry.resourceType === "Sale")
              await restoreSale(tx, entry, req.currentUser!.id);
            else await restorePurchase(tx, entry, req.currentUser!.id);
          }
          await tx.auditLog.create({
            data: {
              actorId: req.currentUser!.id,
              action: final ? "RECYCLE_BIN_FINALIZED" : "RECYCLE_BIN_RESTORED",
              resourceType: entry.resourceType,
              resourceId: entry.resourceId,
              requestId: req.requestId,
              metadata: { entryId },
            },
          });
          return { id: entryId, status: final ? "FINALIZED" : "RESTORED" };
        },
        { timeout: 60000, maxWait: 10000 },
      ),
    };
  }
}
