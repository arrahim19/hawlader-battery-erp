import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Req,
  ValidationPipe,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Transform } from "class-transformer";
import { Equals, IsOptional, IsString, MaxLength } from "class-validator";
import { Permissions, type AuthRequest } from "./auth";
import { DatabaseService } from "./database.service";

class CancelTransactionDto {
  @Equals(true) confirmed!: boolean;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @IsOptional()
  @MaxLength(500)
  reason?: string;
}
const validation = new ValidationPipe({
  expectedType: CancelTransactionDto,
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const activeAllocations = {
  reversedAllocationId: null,
  reversal: { is: null },
  payment: { reversedPaymentId: null, reversal: { is: null } },
} as const;
type Tx = Prisma.TransactionClient;

export async function reverseJournal(
  tx: Tx,
  journalId: string | undefined,
  actorId: string,
  source: string,
  reason: string,
  now: Date,
) {
  if (!journalId) return null;
  const original = await tx.journalEntry.findUniqueOrThrow({
    where: { id: journalId },
    include: { lines: true, reversal: true },
  });
  if (original.reversal)
    throw new ConflictException(
      "This transaction already has a financial correction. Use the correction workflow.",
    );
  const posting = await tx.posting.create({
    data: { actorId, kind: "TRANSACTION_REVERSAL", sourceCode: source, reason },
  });
  return tx.journalEntry.create({
    data: {
      postingId: posting.id,
      postedAt: now,
      reason,
      reversedEntryId: original.id,
      lines: {
        create: original.lines.map((line) => ({
          accountId: line.accountId,
          customerId: line.customerId,
          supplierId: line.supplierId,
          debit: line.credit,
          credit: line.debit,
        })),
      },
    },
  });
}

export async function reversePayments(
  tx: Tx,
  target: { saleId: string } | { purchaseReceiptId: string },
  actorId: string,
  reason: string,
  now: Date,
) {
  const allocations = await tx.paymentAllocation.findMany({
    where: { ...target, ...activeAllocations },
    select: { paymentId: true },
  });
  const reversalIds: string[] = [];
  for (const paymentId of [
    ...new Set(allocations.map((item) => item.paymentId)),
  ].sort()) {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${paymentId}::uuid FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { allocations: { include: { reversal: true } }, reversal: true },
    });
    if (
      payment.reversal ||
      payment.reversedPaymentId ||
      payment.allocations.some(
        (allocation) =>
          allocation.reversedAllocationId ||
          allocation.reversal ||
          ("saleId" in target
            ? allocation.saleId !== target.saleId
            : allocation.purchaseReceiptId !== target.purchaseReceiptId),
      ) ||
      !payment.allocations
        .reduce((sum, item) => sum.add(item.amount), new Prisma.Decimal(0))
        .equals(payment.amount)
    )
      throw new ConflictException(
        "A shared or corrected payment prevents deletion. Settle it through the payment correction workflow.",
      );
    const journal = await reverseJournal(
      tx,
      payment.journalId,
      actorId,
      "cancel-payment:" + payment.id,
      reason,
      now,
    );
    const reversal = await tx.payment.create({
      data: {
        number: "REV-" + payment.id,
        direction: payment.direction === "INCOMING" ? "OUTGOING" : "INCOMING",
        amount: payment.amount,
        method: payment.method,
        occurredAt: now,
        customerId: payment.customerId,
        supplierId: payment.supplierId,
        assetAccountId: payment.assetAccountId,
        journalId: journal!.id,
        reversedPaymentId: payment.id,
        allocations: {
          create: payment.allocations.map((allocation) => ({
            saleId: allocation.saleId,
            purchaseReceiptId: allocation.purchaseReceiptId,
            amount: allocation.amount,
            reversedAllocationId: allocation.id,
          })),
        },
      },
    });
    reversalIds.push(reversal.id);
  }
  return reversalIds;
}

export async function lockProducts(tx: Tx, productIds: string[]) {
  for (const id of [...new Set(productIds)].sort())
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"sale-stock:" + id}, 0))`;
}

async function reverseMovements(
  tx: Tx,
  originalPostingId: string,
  actorId: string,
  source: string,
  reason: string,
  now: Date,
  purchase = false,
) {
  const movements = await tx.stockMovement.findMany({
    where: { postingId: originalPostingId },
    include: { reversals: true },
    orderBy: { lineNumber: "asc" },
  });
  if (movements.some((movement) => movement.reversals))
    throw new ConflictException("Stock movements were already corrected.");
  const posting = await tx.posting.create({
    data: {
      actorId,
      kind: "TRANSACTION_STOCK_REVERSAL",
      sourceCode: source,
      reason,
    },
  });
  await tx.stockMovement.createMany({
    data: movements.map((movement, index) => ({
      postingId: posting.id,
      lineNumber: index + 1,
      productId: movement.productId,
      batchId: movement.batchId,
      batteryUnitId: movement.batteryUnitId,
      quantity: movement.quantity,
      reversedMovementId: movement.id,
      fromCustody: movement.toCustody,
      toCustody: purchase ? "DISPOSED" : movement.fromCustody,
      fromState: movement.toState,
      toState: purchase ? "RETIRED" : movement.fromState,
      fromCondition: movement.toCondition,
      toCondition: purchase ? movement.toCondition : movement.fromCondition,
      fromOwnership: movement.toOwnership,
      toOwnership: purchase ? "DISPOSED" : movement.fromOwnership,
      reason,
      occurredAt: now,
    })),
  });
  return posting.id;
}

@Controller()
export class TransactionCancellationController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Delete("sales/:id")
  @Permissions("sales.manage", "transactions.reverse")
  async cancelSale(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(validation) body: CancelTransactionDto,
    @Req() req: AuthRequest,
  ) {
    return {
      data: await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Sale" WHERE id=${id}::uuid FOR UPDATE`;
          const initial = await tx.sale.findUnique({
            where: { id },
            include: { items: true },
          });
          if (!initial) throw new NotFoundException("Sale not found.");
          if (initial.status === "CANCELLED")
            return { id, status: "CANCELLED" };
          await lockProducts(
            tx,
            initial.items.map((item) => item.productId),
          );
          const sale = await tx.sale.findUniqueOrThrow({
            where: { id },
            include: {
              returns: true,
              posting: { include: { journal: true } },
              items: {
                include: {
                  units: {
                    where: { releasedAt: null },
                    include: { warrantyClaims: true, batteryUnit: true },
                  },
                  costAllocations: {
                    where: {
                      reversedAllocationId: null,
                      reversals: { is: null },
                    },
                    include: { reversals: true },
                  },
                },
              },
            },
          });
          if (
            sale.status !== "CONFIRMED" ||
            !sale.postingId ||
            sale.returns.length ||
            sale.items.some(
              (item) =>
                item.units.some(
                  (unit) => unit.warrantyClaims.length || unit.releasedAt,
                ) ||
                item.costAllocations.some(
                  (allocation) =>
                    allocation.reversedAllocationId || allocation.reversals,
                ),
            )
          )
            throw new ConflictException(
              "This sale has a return, warranty claim or correction. Use the return/correction workflow.",
            );
          const unitIds = sale.items.flatMap((item) =>
            item.units.map((unit) => unit.batteryUnitId),
          );
          if (
            unitIds.length &&
            (await tx.replacementRecord.count({
              where: { oldUnitId: { in: unitIds } },
            }))
          )
            throw new ConflictException(
              "A replacement record prevents deletion of this sale.",
            );
          const now = new Date(),
            actorId = req.currentUser!.id;
          const reason = `Delete sale ${sale.invoiceNumber}: ${body.reason || "Deleted by operator"}`;
          for (const item of sale.items) {
            if (
              !item.costAllocations
                .reduce(
                  (sum, allocation) => sum.add(allocation.quantity),
                  new Prisma.Decimal(0),
                )
                .equals(item.quantity)
            )
              throw new ConflictException(
                "Sale stock allocations are incomplete; cancellation cannot proceed.",
              );
            for (const unit of item.units) {
              const changed = await tx.batteryUnit.updateMany({
                where: {
                  id: unit.batteryUnitId,
                  condition: "GOOD",
                  custody: "CUSTOMER",
                  ownership: "CUSTOMER",
                  commercialState: "SOLD",
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
              if (changed.count !== 1)
                throw new ConflictException(
                  "A sold battery has changed state and cannot be restored automatically.",
                );
              await tx.saleUnit.update({
                where: { id: unit.id },
                data: { releasedAt: now },
              });
            }
            for (const allocation of item.costAllocations) {
              if (!allocation.batteryUnitId)
                await tx.inventoryBalance.upsert({
                  where: {
                    batchId_location_bucket: {
                      batchId: allocation.batchId,
                      location: "SHOP",
                      bucket: "AVAILABLE",
                    },
                  },
                  create: {
                    batchId: allocation.batchId,
                    location: "SHOP",
                    bucket: "AVAILABLE",
                    quantity: allocation.quantity,
                  },
                  update: { quantity: { increment: allocation.quantity } },
                });
              await tx.costAllocation.create({
                data: {
                  saleItemId: item.id,
                  batchId: allocation.batchId,
                  batteryUnitId: allocation.batteryUnitId,
                  quantity: allocation.quantity,
                  unitCost: allocation.unitCost,
                  cogs: allocation.cogs,
                  reversedAllocationId: allocation.id,
                },
              });
            }
          }
          const stockReversalPostingId = await reverseMovements(
            tx,
            sale.postingId,
            actorId,
            "cancel-sale-stock:" + id + ":" + sale.version,
            reason,
            now,
          );
          const journalReversal = await reverseJournal(
            tx,
            sale.posting?.journal?.id,
            actorId,
            "cancel-sale-journal:" + id + ":" + sale.version,
            reason,
            now,
          );
          const paymentReversalIds = await reversePayments(
            tx,
            { saleId: id },
            actorId,
            reason,
            now,
          );
          await tx.sale.update({
            where: { id },
            data: { status: "CANCELLED", version: { increment: 1 } },
          });
          await tx.auditLog.create({
            data: {
              actorId,
              action: "SALE_CANCELLED",
              resourceType: "Sale",
              resourceId: id,
              reason: body.reason || "Deleted by operator",
              requestId: req.requestId,
              metadata: {
                invoiceNumber: sale.invoiceNumber,
                stockReversalPostingId,
                journalReversalId: journalReversal?.id ?? null,
                paymentReversalIds,
                costAllocationIds: sale.items.flatMap((item) =>
                  item.costAllocations.map((a) => a.id),
                ),
                saleUnitIds: sale.items.flatMap((item) =>
                  item.units.map((u) => u.id),
                ),
              },
            },
          });
          return { id, status: "CANCELLED" };
        },
        { timeout: 60000, maxWait: 10000 },
      ),
    };
  }

  @Delete("purchases/:id")
  @Permissions("purchases.manage", "transactions.reverse")
  async cancelPurchase(
    @Param("id", ParseUUIDPipe) id: string,
    @Body(validation) body: CancelTransactionDto,
    @Req() req: AuthRequest,
  ) {
    return {
      data: await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id=${id}::uuid FOR UPDATE`;
          const initial = await tx.purchase.findUnique({
            where: { id },
            include: { items: true },
          });
          if (!initial) throw new NotFoundException("Purchase not found.");
          if (initial.status === "CANCELLED")
            return { id, status: "CANCELLED" };
          await lockProducts(
            tx,
            initial.items.map((item) => item.productId),
          );
          const purchase = await tx.purchase.findUniqueOrThrow({
            where: { id },
            include: {
              receipts: {
                include: {
                  posting: { include: { journal: true } },
                  items: {
                    include: {
                      returns: true,
                      batch: {
                        include: {
                          product: { include: { type: true } },
                          balances: true,
                          batteryUnits: true,
                          costAllocations: {
                            where: {
                              reversedAllocationId: null,
                              reversals: { is: null },
                            },
                          },
                          stockAdjustmentItem_originalBatch: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          });
          if (purchase.status !== "RECEIVED" || purchase.receipts.length !== 1)
            throw new ConflictException(
              "Only a fully received purchase with one unchanged receipt can be deleted.",
            );
          const receipt = purchase.receipts[0];
          const batches = receipt.items.map((item) => item.batch);
          if (
            receipt.items.some((item) => item.returns.length || !item.batch) ||
            batches.some(
              (batch) =>
                !batch ||
                batch.costAllocations.length ||
                batch.stockAdjustmentItem_originalBatch.length,
            )
          )
            throw new ConflictException(
              "This purchase has stock already used, sold or returned. Reverse the dependent transaction first.",
            );
          const unitIds = batches.flatMap(
            (batch) => batch?.batteryUnits.map((unit) => unit.id) ?? [],
          );
          if (
            unitIds.length &&
            ((await tx.warrantyClaim.count({
              where: { faultyUnitId: { in: unitIds } },
            })) ||
              (await tx.replacementRecord.count({
                where: { oldUnitId: { in: unitIds } },
              })) ||
              (await tx.saleUnit.count({
                where: { batteryUnitId: { in: unitIds }, releasedAt: null },
              })))
          )
            throw new ConflictException(
              "Sold or replacement batteries prevent deleting this purchase.",
            );
          const now = new Date(),
            actorId = req.currentUser!.id;
          const reason = `Delete purchase ${purchase.number}: ${body.reason || "Deleted by operator"}`;
          for (const batch of batches) {
            if (!batch) throw new ConflictException("Purchase batch missing.");
            if (batch.product.type.trackingKind === "BATTERY_UNIT") {
              if (
                !batch.originalQuantity.equals(batch.batteryUnits.length) ||
                batch.batteryUnits.some(
                  (unit) =>
                    unit.condition !== "GOOD" ||
                    unit.custody !== "SHOP" ||
                    unit.ownership !== "SHOP" ||
                    unit.commercialState !== "AVAILABLE" ||
                    unit.reservedCustomerId ||
                    unit.reservedReplacementId,
                )
              )
                throw new ConflictException(
                  "All purchased batteries must still be available in the shop.",
                );
              const changed = await tx.batteryUnit.updateMany({
                where: {
                  id: { in: batch.batteryUnits.map((unit) => unit.id) },
                  custody: "SHOP",
                  ownership: "SHOP",
                  commercialState: "AVAILABLE",
                  condition: "GOOD",
                  reservedCustomerId: null,
                  reservedReplacementId: null,
                },
                data: {
                  custody: "DISPOSED",
                  ownership: "DISPOSED",
                  commercialState: "RETIRED",
                  version: { increment: 1 },
                },
              });
              if (changed.count !== batch.batteryUnits.length)
                throw new ConflictException(
                  "Stock changed. Refresh and try again.",
                );
            } else {
              const available = batch.balances.find(
                (balance) =>
                  balance.location === "SHOP" && balance.bucket === "AVAILABLE",
              );
              if (
                !available ||
                !available.quantity.equals(batch.originalQuantity) ||
                batch.balances.some(
                  (balance) =>
                    balance.id !== available.id && !balance.quantity.isZero(),
                )
              )
                throw new ConflictException(
                  "The full purchased quantity must still be available in the shop.",
                );
              const changed = await tx.inventoryBalance.updateMany({
                where: { id: available.id, quantity: batch.originalQuantity },
                data: { quantity: 0 },
              });
              if (changed.count !== 1)
                throw new ConflictException(
                  "Stock changed. Refresh and try again.",
                );
            }
          }
          const stockReversalPostingId = await reverseMovements(
            tx,
            receipt.postingId,
            actorId,
            "cancel-purchase-stock:" + id + ":" + purchase.version,
            reason,
            now,
            true,
          );
          const journalReversal = await reverseJournal(
            tx,
            receipt.posting.journal?.id,
            actorId,
            "cancel-purchase-journal:" + id + ":" + purchase.version,
            reason,
            now,
          );
          const paymentReversalIds = await reversePayments(
            tx,
            { purchaseReceiptId: receipt.id },
            actorId,
            reason,
            now,
          );
          await tx.purchase.update({
            where: { id },
            data: { status: "CANCELLED", version: { increment: 1 } },
          });
          await tx.auditLog.create({
            data: {
              actorId,
              action: "PURCHASE_CANCELLED",
              resourceType: "Purchase",
              resourceId: id,
              reason: body.reason || "Deleted by operator",
              requestId: req.requestId,
              metadata: {
                number: purchase.number,
                stockReversalPostingId,
                journalReversalId: journalReversal?.id ?? null,
                paymentReversalIds,
              },
            },
          });
          return { id, status: "CANCELLED" };
        },
        { timeout: 60000, maxWait: 10000 },
      ),
    };
  }
}
