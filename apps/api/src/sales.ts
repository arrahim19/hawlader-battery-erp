import {
  orderProductCategories,
  productCategoryCodes,
} from "./product-categories";
import { createHash } from "node:crypto";
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Post,
  Query,
  Req,
  Res,
  ValidationPipe,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  isUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import type { Response } from "express";
import { Permissions, type AuthRequest } from "./auth";
import { businessRange } from "./dashboard";
import { DatabaseService } from "./database.service";
import { customerFields, customerRecords, postedSales } from "./customers";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
class CompleteSaleItemDto {
  @IsUUID() productId!: string;
  @IsInt() @Min(1) @Max(10000) quantity!: number;
  @Matches(/^(?=.*[1-9])\d{1,14}(?:\.\d{1,2})?$/) unitPrice!: string;
}
class CompleteSaleDto {
  @IsUUID() customerId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) saleDate!: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CompleteSaleItemDto)
  items!: CompleteSaleItemDto[];
  @Matches(/^\d{1,18}(?:\.\d{1,2})?$/) paidAmount = "0.00";
  @IsOptional() @IsUUID() paymentAccountId?: string;
}
class SalesQueryDto {
  @Transform(trim) @IsOptional() @IsString() @MaxLength(160) q?: string;
  @IsIn(["all", "paid", "due"]) status = "all";
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 10;
}
const validation = (expectedType: new () => object) =>
  new ValidationPipe({
    expectedType,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
const availableUnit = {
  condition: "GOOD",
  custody: "SHOP",
  ownership: "SHOP",
  commercialState: "AVAILABLE",
  reservedCustomerId: null,
  reservedReplacementId: null,
  saleHistory: { none: { releasedAt: null } },
} as const;
const settledAllocation = {
  reversedAllocationId: null,
  reversal: { is: null },
  payment: { reversedPaymentId: null, reversal: { is: null } },
} as const;
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}
function coverageExpiry(date: string, months: number) {
  const start = new Date(date + "T00:00:00Z");
  const result = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return result;
}
const money = (value: Prisma.Decimal) =>
  value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const maxMoney = new Prisma.Decimal("999999999999999999.99");

@Controller("sales")
@Permissions("sales.manage")
export class SalesController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get("options")
  async options() {
    const [types, products, customers, paymentAccounts] = await Promise.all([
      this.db.productType.findMany({
        where: { active: true, code: { in: productCategoryCodes } },
        select: { id: true, name: true, trackingKind: true, code: true },
        orderBy: { name: "asc" },
      }),
      this.db.product.findMany({
        where: { active: true, type: { active: true } },
        select: {
          id: true,
          name: true,
          model: true,
          unit: true,
          defaultSellingPrice: true,
          type: { select: { id: true, name: true, trackingKind: true } },
          batteryUnits: {
            where: availableUnit,
            select: { id: true },
            orderBy: [{ batch: { acquiredAt: "asc" } }, { id: "asc" }],
          },
          batches: {
            select: {
              balances: {
                where: {
                  location: "SHOP",
                  bucket: "AVAILABLE",
                  quantity: { gt: 0 },
                },
                select: { quantity: true },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      this.db.customer.findMany({
        where: { active: true },
        select: customerFields,
        orderBy: { name: "asc" },
      }),
      this.db.account.findMany({
        where: { active: true, kind: "ASSET", paymentMethod: { not: null } },
        select: { id: true, name: true, paymentMethod: true },
        orderBy: { code: "asc" },
      }),
    ]);
    return {
      data: {
        types: orderProductCategories(types).map(
          ({ id, name, trackingKind }) => ({ id, name, trackingKind }),
        ),
        products: products.map(({ batteryUnits, batches, ...product }) => ({
          ...product,
          defaultSellingPrice: product.defaultSellingPrice.toFixed(2),
          availableQuantity:
            product.type.trackingKind === "BATTERY_UNIT"
              ? String(batteryUnits.length)
              : batches
                  .flatMap((batch) => batch.balances)
                  .reduce(
                    (sum, balance) => sum.add(balance.quantity),
                    new Prisma.Decimal(0),
                  )
                  .toString(),
        })),
        customers: await customerRecords(this.db, customers),
        paymentAccounts,
      },
    };
  }

  @Get()
  async list(@Query(validation(SalesQueryDto)) query: SalesQueryDto) {
    const rows = await this.db.sale.findMany({
      where: {
        status: { in: [...postedSales] },
        ...(query.q
          ? {
              OR: [
                { invoiceNumber: { contains: query.q, mode: "insensitive" } },
                {
                  customer: {
                    OR: [
                      { name: { contains: query.q, mode: "insensitive" } },
                      { phone: { contains: query.q, mode: "insensitive" } },
                    ],
                  },
                },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        invoiceNumber: true,
        customer: { select: { id: true, name: true, phone: true } },
        soldAt: true,
        status: true,
        subtotal: true,
        total: true,
        items: { select: { quantity: true } },
        paymentAllocations: {
          where: settledAllocation,
          select: { amount: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    const all = rows
      .map(({ soldAt, items, paymentAllocations, ...sale }) => {
        const paid = paymentAllocations.reduce(
          (sum, allocation) => sum.add(allocation.amount),
          new Prisma.Decimal(0),
        );
        return {
          ...sale,
          saleDate: soldAt
            ? new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Dhaka",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(soldAt)
            : null,
          subtotal: sale.subtotal.toFixed(2),
          total: sale.total.toFixed(2),
          paid: paid.toFixed(2),
          due: sale.total.sub(paid).toFixed(2),
          quantity: items
            .reduce(
              (sum, item) => sum.add(item.quantity),
              new Prisma.Decimal(0),
            )
            .toString(),
          itemCount: items.length,
        };
      })
      .filter(
        (sale) =>
          query.status === "all" ||
          (query.status === "due"
            ? new Prisma.Decimal(sale.due).gt(0)
            : new Prisma.Decimal(sale.due).lte(0)),
      );
    return {
      data: {
        items: all.slice(
          (query.page - 1) * query.pageSize,
          query.page * query.pageSize,
        ),
        total: all.length,
        page: query.page,
        pageSize: query.pageSize,
      },
    };
  }

  @Post("complete")
  async complete(
    @Body(validation(CompleteSaleDto)) body: CompleteSaleDto,
    @Headers("idempotency-key") key: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!key || !isUUID(key))
      throw new BadRequestException("A UUID Idempotency-Key is required.");
    const range = businessRange(body.saleDate, body.saleDate);
    const paid = new Prisma.Decimal(body.paidAmount);
    if (
      paid.gt(0) &&
      !req.currentUser!.permissions.some((permission) =>
        ["payments.customer", "finance.write"].includes(permission),
      )
    )
      throw new ForbiddenException(
        "Recording customer payments requires payment permission.",
      );
    if (
      new Set(body.items.map((item) => item.productId)).size !==
      body.items.length
    )
      throw new BadRequestException(
        "Combine the same product into one sale line.",
      );
    const total = body.items.reduce(
      (sum, item) =>
        sum.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity)),
      new Prisma.Decimal(0),
    );
    if (total.gt(maxMoney) || paid.gt(total))
      throw new BadRequestException("Invalid sale or payment total.");
    const requestHash = createHash("sha256")
      .update(JSON.stringify(stable(body)))
      .digest("hex");
    const actorId = req.currentUser!.id;
    const operation = "SALE_COMPLETE";
    const soldAt = new Date(body.saleDate + "T12:00:00+06:00");
    let replayed = false;
    const response = await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actorId + ":" + operation + ":" + key}, 0))`;
        const prior = await tx.idempotencyRecord.findUnique({
          where: { actorId_operation_key: { actorId, operation, key } },
        });
        if (prior) {
          const previousSale = await tx.sale.findUnique({
            where: { id: prior.sourceId },
            select: { status: true },
          });
          if (previousSale?.status === "CANCELLED")
            throw new ConflictException(
              "This sale was deleted. Start a new sale instead of retrying it.",
            );
          if (prior.requestHash !== requestHash)
            throw new ConflictException(
              "This sale was already submitted with different details. Reload the sales list.",
            );
          replayed = true;
          return prior.responseBody;
        }
        // A stable lock order serializes competing sales before choosing FIFO stock.
        for (const productId of body.items.map((item) => item.productId).sort())
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"sale-stock:" + productId}, 0))`;
        const customer = await tx.customer.findUnique({
          where: { id: body.customerId },
        });
        if (!customer?.active)
          throw new BadRequestException("Select an active customer.");
        const products = await tx.product.findMany({
          where: { id: { in: body.items.map((item) => item.productId) } },
          include: { type: true, batteryDetail: true, partsDetail: true },
        });
        const paymentAccount =
          paid.gt(0) && body.paymentAccountId
            ? await tx.account.findUnique({
                where: { id: body.paymentAccountId },
              })
            : null;
        if (
          paid.gt(0) &&
          (!paymentAccount?.active ||
            paymentAccount.kind !== "ASSET" ||
            !paymentAccount.paymentMethod)
        )
          throw new BadRequestException("Choose an active payment method.");
        const posting = await tx.posting.create({
          data: { actorId, kind: operation, sourceCode: "sale:" + key },
        });
        const [invoice] = await tx.$queryRaw<{ invoiceNumber: string }[]>`
          SELECT 'HB-' || lpad(nextval('"Sale_invoice_number_seq"')::text, 4, '0') AS "invoiceNumber"
        `;
        const invoiceNumber = invoice.invoiceNumber;
        const sale = await tx.sale.create({
          data: {
            id: key,
            invoiceNumber,
            status: "CONFIRMED",
            soldAt,
            subtotal: total,
            total,
            customerId: customer.id,
            postingId: posting.id,
            invoiceSnapshot: {
              customer: {
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                address: customer.address,
              },
              saleDate: body.saleDate,
              notes: body.notes ?? "",
            },
          },
        });
        let movementLine = 0;
        let costTotal = new Prisma.Decimal(0);
        let batteryCount = 0;
        for (const [index, item] of body.items.entries()) {
          const product = products.find(
            (product) => product.id === item.productId,
          );
          if (!product?.active || !product.type.active)
            throw new BadRequestException(
              "One of the selected products is inactive or missing.",
            );
          const warrantyMonths =
            product.batteryDetail?.defaultWarrantyMonths ??
            product.partsDetail?.defaultWarrantyMonths ??
            0;
          const start = new Date(body.saleDate + "T00:00:00Z");
          const expiry = coverageExpiry(body.saleDate, warrantyMonths);
          const line = await tx.saleItem.create({
            data: {
              saleId: sale.id,
              productId: product.id,
              lineNumber: index + 1,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              netRevenue: new Prisma.Decimal(item.unitPrice).mul(item.quantity),
              productSnapshot: {
                id: product.id,
                name: product.name,
                model: product.model,
                unit: product.unit,
                type: product.type.name,
              },
              warrantySnapshot: {
                months: warrantyMonths,
                coverageStart: body.saleDate,
                coverageExpiry: expiry.toISOString().slice(0, 10),
                source: "PRODUCT_DEFAULT",
              },
            },
          });
          let lineCost = new Prisma.Decimal(0);
          const movement = {
            postingId: posting.id,
            productId: product.id,
            fromCustody: "SHOP" as const,
            toCustody: "CUSTOMER" as const,
            fromState: "AVAILABLE" as const,
            toState: "SOLD" as const,
            fromCondition: "GOOD" as const,
            toCondition: "GOOD" as const,
            fromOwnership: "SHOP" as const,
            toOwnership: "CUSTOMER" as const,
            reason: "Sale " + invoiceNumber,
            occurredAt: soldAt,
          };
          if (product.type.trackingKind === "BATTERY_UNIT") {
            batteryCount += item.quantity;
            if (batteryCount > 500)
              throw new BadRequestException(
                "A sale can include at most 500 batteries.",
              );
            const units = await tx.batteryUnit.findMany({
              where: {
                ...availableUnit,
                productId: product.id,
                batch: { acquiredAt: { lt: range.end } },
              },
              include: { batch: true },
              orderBy: [{ batch: { acquiredAt: "asc" } }, { id: "asc" }],
              take: item.quantity,
            });
            if (units.length !== item.quantity)
              throw new ConflictException(
                "There are not enough available batteries for this sale date. Refresh the stock.",
              );
            for (const unit of units) {
              const changed = await tx.batteryUnit.updateMany({
                where: { id: unit.id, ...availableUnit },
                data: {
                  custody: "CUSTOMER",
                  ownership: "CUSTOMER",
                  commercialState: "SOLD",
                  version: { increment: 1 },
                },
              });
              if (changed.count !== 1)
                throw new ConflictException(
                  "A selected battery was already sold. Refresh the stock.",
                );
              const cogs = money(unit.batch.unitCost);
              lineCost = lineCost.add(cogs);
              await tx.saleUnit.create({
                data: {
                  saleItemId: line.id,
                  batteryUnitId: unit.id,
                  coverageStart: start,
                  coverageExpiry: expiry,
                  costAtSale: unit.batch.unitCost,
                },
              });
              await tx.costAllocation.create({
                data: {
                  saleItemId: line.id,
                  batchId: unit.batchId,
                  batteryUnitId: unit.id,
                  quantity: 1,
                  unitCost: unit.batch.unitCost,
                  cogs,
                },
              });
              await tx.stockMovement.create({
                data: {
                  ...movement,
                  batchId: unit.batchId,
                  batteryUnitId: unit.id,
                  quantity: 1,
                  lineNumber: ++movementLine,
                },
              });
            }
          } else {
            const balances = await tx.inventoryBalance.findMany({
              where: {
                location: "SHOP",
                bucket: "AVAILABLE",
                quantity: { gt: 0 },
                batch: { productId: product.id, acquiredAt: { lt: range.end } },
              },
              include: { batch: true },
              orderBy: [{ batch: { acquiredAt: "asc" } }, { batchId: "asc" }],
            });
            let remaining = new Prisma.Decimal(item.quantity);
            for (const balance of balances) {
              if (remaining.isZero()) break;
              const quantity = Prisma.Decimal.min(remaining, balance.quantity);
              const changed = await tx.inventoryBalance.updateMany({
                where: {
                  id: balance.id,
                  location: "SHOP",
                  bucket: "AVAILABLE",
                  quantity: { gte: quantity },
                },
                data: { quantity: { decrement: quantity } },
              });
              if (changed.count !== 1)
                throw new ConflictException(
                  "Available stock changed. Refresh and try again.",
                );
              const cogs = money(quantity.mul(balance.batch.unitCost));
              lineCost = lineCost.add(cogs);
              remaining = remaining.sub(quantity);
              await tx.costAllocation.create({
                data: {
                  saleItemId: line.id,
                  batchId: balance.batchId,
                  quantity,
                  unitCost: balance.batch.unitCost,
                  cogs,
                },
              });
              await tx.stockMovement.create({
                data: {
                  ...movement,
                  batchId: balance.batchId,
                  quantity,
                  lineNumber: ++movementLine,
                },
              });
            }
            if (remaining.gt(0))
              throw new ConflictException(
                "There is not enough available stock for this sale date. Refresh the stock.",
              );
          }
          await tx.saleItem.update({
            where: { id: line.id },
            data: { costTotal: lineCost },
          });
          costTotal = costTotal.add(lineCost);
        }
        if (costTotal.gt(maxMoney))
          throw new BadRequestException(
            "The sale inventory cost exceeds the supported total.",
          );
        const accounts = await tx.account.findMany({
          where: { code: { in: ["1200", "1300", "4100", "5100"] } },
        });
        const account = (code: string, kind: string) => {
          const found = accounts.find(
            (item) => item.code === code && item.kind === kind && item.active,
          );
          if (!found)
            throw new BadRequestException(
              "Sales accounts are not configured. Contact the administrator.",
            );
          return found.id;
        };
        const journalLines: Prisma.JournalLineCreateWithoutEntryInput[] = [];
        if (total.gt(0))
          journalLines.push(
            {
              account: { connect: { id: account("1200", "ASSET") } },
              customer: { connect: { id: customer.id } },
              debit: total,
            },
            {
              account: { connect: { id: account("4100", "REVENUE") } },
              credit: total,
            },
          );
        if (costTotal.gt(0))
          journalLines.push(
            {
              account: { connect: { id: account("5100", "EXPENSE") } },
              debit: costTotal,
            },
            {
              account: { connect: { id: account("1300", "ASSET") } },
              credit: costTotal,
            },
          );
        if (journalLines.length)
          await tx.journalEntry.create({
            data: {
              postingId: posting.id,
              postedAt: soldAt,
              reason: "Sale " + invoiceNumber,
              lines: { create: journalLines },
            },
          });
        if (paid.gt(0)) {
          const paymentPosting = await tx.posting.create({
            data: {
              actorId,
              kind: "CUSTOMER_PAYMENT",
              sourceCode: "sale-payment:" + sale.id,
            },
          });
          const journal = await tx.journalEntry.create({
            data: {
              postingId: paymentPosting.id,
              postedAt: soldAt,
              reason: "Customer payment " + invoiceNumber,
              lines: {
                create: [
                  { accountId: paymentAccount!.id, debit: paid },
                  {
                    accountId: account("1200", "ASSET"),
                    customerId: customer.id,
                    credit: paid,
                  },
                ],
              },
            },
          });
          await tx.payment.create({
            data: {
              number: "PAY-" + sale.id,
              direction: "INCOMING",
              amount: paid,
              method: paymentAccount!.paymentMethod!,
              occurredAt: soldAt,
              customerId: customer.id,
              assetAccountId: paymentAccount!.id,
              journalId: journal.id,
              allocations: { create: { saleId: sale.id, amount: paid } },
            },
          });
        }
        await tx.auditLog.create({
          data: {
            actorId,
            action: operation,
            resourceType: "Sale",
            resourceId: sale.id,
            requestId: req.requestId,
            metadata: { customerId: customer.id, invoiceNumber },
          },
        });
        const result = {
          id: sale.id,
          invoiceNumber,
          customerId: customer.id,
          subtotal: total.toFixed(2),
          total: total.toFixed(2),
          paid: paid.toFixed(2),
          due: total.sub(paid).toFixed(2),
          quantity: body.items.reduce((sum, item) => sum + item.quantity, 0),
        };
        await tx.idempotencyRecord.create({
          data: {
            actorId,
            operation,
            key,
            requestHash,
            responseStatus: 201,
            responseBody: result,
            sourceId: sale.id,
          },
        });
        return result;
      },
      { timeout: 30000, maxWait: 10000 },
    );
    if (replayed) res.setHeader("Idempotency-Replayed", "true");
    return { data: response };
  }
}
