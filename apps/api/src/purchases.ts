import {
  orderProductCategories,
  productCategoryCodes,
} from "./product-categories";
import { createHash, randomUUID } from "node:crypto";
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
import type { Response } from "express";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
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
import { Permissions, type AuthRequest } from "./auth";
import { businessRange } from "./dashboard";
import { DatabaseService } from "./database.service";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
class ReceiveItemDto {
  @IsUUID() productId!: string;
  @IsInt() @Min(1) @Max(10000) quantity!: number;
  @Matches(/^\d{1,14}(?:\.\d{1,2})?$/) unitPrice!: string;
}
class ReceivePurchaseDto {
  @IsUUID() supplierId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) purchaseDate!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) reference!: string;
  @Transform(trim) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items!: ReceiveItemDto[];
  @Matches(/^\d{1,18}(?:\.\d{1,2})?$/) paidAmount = "0.00";
  @Matches(/^\d{1,14}(?:\.\d{1,2})?$/) transportAmount = "0.00";
  @IsOptional() @IsUUID() paymentAccountId?: string;
}
class PurchaseListDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
const validation = (expectedType: new () => object) =>
  new ValidationPipe({
    expectedType,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
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
const maxMoney = new Prisma.Decimal("999999999999999999.99");

@Controller("purchases")
@Permissions("purchases.manage")
export class PurchasesController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get("options")
  async options() {
    const [products, types, suppliers, paymentAccounts, names] =
      await Promise.all([
        this.db.product.findMany({
          where: { active: true, type: { active: true } },
          select: {
            id: true,
            name: true,
            model: true,
            unit: true,
            batteryDetail: {
              select: {
                capacityAh: true,
                voltage: true,
                defaultWarrantyMonths: true,
              },
            },
            partsDetail: {
              select: { specifications: true, defaultWarrantyMonths: true },
            },
            type: { select: { id: true, name: true, trackingKind: true } },
          },
          orderBy: { name: "asc" },
        }),
        this.db.productType.findMany({
          where: { active: true, code: { in: productCategoryCodes } },
          select: { id: true, name: true, trackingKind: true, code: true },
          orderBy: { name: "asc" },
        }),
        this.db.supplier.findMany({
          where: {
            active: true,
            productType: { active: true, code: { in: productCategoryCodes } },
          },
          select: { id: true, name: true, company: true, productTypeId: true },
          orderBy: { name: "asc" },
        }),
        this.db.account.findMany({
          where: { active: true, kind: "ASSET", paymentMethod: { not: null } },
          select: { id: true, name: true, paymentMethod: true },
          orderBy: { code: "asc" },
        }),
        this.db.category.findMany({
          where: { active: true },
          select: {
            id: true,
            name: true,
            types: { select: { typeId: true } },
          },
          orderBy: { name: "asc" },
        }),
      ]);
    return {
      data: {
        products: products.map(
          ({ batteryDetail, partsDetail, ...product }) => ({
            ...product,
            capacityAh: batteryDetail?.capacityAh?.toString() ?? null,
            voltage: batteryDetail?.voltage?.toString() ?? null,
            specifications: partsDetail?.specifications ?? null,
            warrantyMonths:
              batteryDetail?.defaultWarrantyMonths ??
              partsDetail?.defaultWarrantyMonths ??
              0,
          }),
        ),
        types: orderProductCategories(types).map(
          ({ id, name, trackingKind }) => ({ id, name, trackingKind }),
        ),
        productNames: names.flatMap((name) =>
          name.types
            .filter((link) => types.some((type) => type.id === link.typeId))
            .map(({ typeId }) => ({ id: name.id, name: name.name, typeId })),
        ),
        suppliers,
        paymentAccounts,
      },
    };
  }

  @Get("recent")
  async recent() {
    const purchases = await this.db.purchase.findMany({
      where: { status: "RECEIVED" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: {
        id: true,
        number: true,
        orderDate: true,
        supplierReference: true,
        supplier: { select: { name: true, company: true } },
        items: {
          orderBy: { lineNumber: "asc" },
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            product: {
              select: {
                name: true,
                model: true,
                type: { select: { name: true } },
                batteryDetail: {
                  select: {
                    capacityAh: true,
                    voltage: true,
                    defaultWarrantyMonths: true,
                  },
                },
                partsDetail: {
                  select: { specifications: true, defaultWarrantyMonths: true },
                },
              },
            },
          },
        },
      },
    });
    return {
      data: {
        items: purchases.map(({ orderDate, items, ...purchase }) => ({
          ...purchase,
          purchaseDate: orderDate.toISOString().slice(0, 10),
          items: items.map(({ product, quantity, unitPrice, id }) => ({
            id,
            name: product.name,
            typeName: product.type.name,
            model: product.model,
            capacityAh: product.batteryDetail?.capacityAh?.toString() ?? null,
            voltage: product.batteryDetail?.voltage?.toString() ?? null,
            specifications: product.partsDetail?.specifications ?? null,
            warrantyMonths:
              product.batteryDetail?.defaultWarrantyMonths ??
              product.partsDetail?.defaultWarrantyMonths ??
              0,
            quantity: quantity.toString(),
            unitPrice: unitPrice.toFixed(2),
            total: quantity.mul(unitPrice).toFixed(2),
          })),
        })),
      },
    };
  }

  @Get()
  async list(@Query(validation(PurchaseListDto)) query: PurchaseListDto) {
    const [purchases, total] = await this.db.$transaction([
      this.db.purchase.findMany({
        where: { status: { not: "CANCELLED" } },
        select: {
          id: true,
          number: true,
          supplierReference: true,
          orderDate: true,
          status: true,
          supplier: { select: { id: true, name: true, company: true } },
          items: {
            orderBy: { lineNumber: "asc" },
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              product: {
                select: {
                  name: true,
                  model: true,
                  type: { select: { name: true } },
                  batteryDetail: {
                    select: {
                      capacityAh: true,
                      voltage: true,
                      defaultWarrantyMonths: true,
                    },
                  },
                  partsDetail: {
                    select: {
                      specifications: true,
                      defaultWarrantyMonths: true,
                    },
                  },
                },
              },
            },
          },
          receipts: {
            select: {
              paymentAllocations: {
                where: {
                  reversedAllocationId: null,
                  reversal: { is: null },
                  payment: { reversal: { is: null }, reversedPaymentId: null },
                },
                select: { amount: true },
              },
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.purchase.count({ where: { status: { not: "CANCELLED" } } }),
    ]);
    return {
      data: {
        items: purchases.map(({ items, receipts, orderDate, ...purchase }) => {
          const total = items.reduce(
            (sum, item) => sum.add(item.quantity.mul(item.unitPrice)),
            new Prisma.Decimal(0),
          );
          const paid = receipts
            .flatMap((receipt) => receipt.paymentAllocations)
            .reduce(
              (sum, allocation) => sum.add(allocation.amount),
              new Prisma.Decimal(0),
            );
          return {
            ...purchase,
            purchaseDate: orderDate.toISOString().slice(0, 10),
            itemCount: items.length,
            items: items.map(({ product, quantity, unitPrice, id }) => ({
              id,
              name: product.name,
              typeName: product.type.name,
              model: product.model,
              capacityAh: product.batteryDetail?.capacityAh?.toString() ?? null,
              voltage: product.batteryDetail?.voltage?.toString() ?? null,
              specifications: product.partsDetail?.specifications ?? null,
              warrantyMonths:
                product.batteryDetail?.defaultWarrantyMonths ??
                product.partsDetail?.defaultWarrantyMonths ??
                0,
              quantity: quantity.toString(),
              unitPrice: unitPrice.toFixed(2),
              total: quantity.mul(unitPrice).toFixed(2),
            })),
            quantity: items
              .reduce(
                (sum, item) => sum.add(item.quantity),
                new Prisma.Decimal(0),
              )
              .toString(),
            total: total.toFixed(2),
            paid: paid.toFixed(2),
            due: total.sub(paid).toFixed(2),
          };
        }),
        total,
        page: query.page,
        pageSize: query.pageSize,
      },
    };
  }

  @Post("receive")
  @Permissions("purchases.manage", "inventory.receive")
  async receive(
    @Body(validation(ReceivePurchaseDto)) body: ReceivePurchaseDto,
    @Headers("idempotency-key") requestKey: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!requestKey || !isUUID(requestKey))
      throw new BadRequestException("A UUID Idempotency-Key is required.");
    businessRange(body.purchaseDate, body.purchaseDate);
    const paid = new Prisma.Decimal(body.paidAmount);
    const transport = new Prisma.Decimal(body.transportAmount);
    if (
      (paid.gt(0) || transport.gt(0)) &&
      !req.currentUser!.permissions.includes("finance.write")
    )
      throw new ForbiddenException(
        "Recording payments or transport expenses requires finance permission.",
      );
    if (
      new Set(body.items.map((item) => item.productId)).size !==
      body.items.length
    )
      throw new BadRequestException(
        "Combine the same product into one purchase line.",
      );
    const total = body.items.reduce(
      (sum, item) =>
        sum.add(new Prisma.Decimal(item.unitPrice).mul(item.quantity)),
      new Prisma.Decimal(0),
    );
    if (total.gt(maxMoney) || paid.gt(total))
      throw new BadRequestException("Invalid purchase or payment total.");
    const requestHash = createHash("sha256")
      .update(JSON.stringify(stable(body)))
      .digest("hex");
    const actorId = req.currentUser!.id;
    const operation = "PURCHASE_RECEIVE";
    const receivedAt = new Date(body.purchaseDate + "T12:00:00+06:00");
    let replayed = false;
    const response = await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actorId + ":" + operation + ":" + requestKey}, 0))`;
        const prior = await tx.idempotencyRecord.findUnique({
          where: {
            actorId_operation_key: { actorId, operation, key: requestKey },
          },
        });
        if (prior) {
          const previousPurchase = await tx.purchase.findFirst({
            where: { receipts: { some: { id: prior.sourceId } } },
            select: { status: true },
          });
          if (previousPurchase?.status === "CANCELLED")
            throw new ConflictException(
              "This purchase was deleted. Start a new purchase instead of retrying it.",
            );
          if (prior.requestHash !== requestHash)
            throw new ConflictException(
              "This purchase was already submitted with different details. Reload the purchase list.",
            );
          replayed = true;
          return prior.responseBody;
        }
        const supplier = await tx.supplier.findUnique({
          where: { id: body.supplierId },
        });
        if (!supplier?.active)
          throw new BadRequestException("Select an active supplier.");
        const products = await tx.product.findMany({
          where: { id: { in: body.items.map((item) => item.productId) } },
          include: { type: true, batteryDetail: true },
        });
        if (
          !supplier.productTypeId ||
          products.some((product) => product.typeId !== supplier.productTypeId)
        )
          throw new BadRequestException(
            "Choose a supplier from the same product category as all purchase items.",
          );
        const inventory = await tx.account.findUnique({
          where: { code: "1300" },
        });
        const payable = await tx.account.findUnique({
          where: { code: "2100" },
        });
        if (
          total.gt(0) &&
          (!inventory?.active ||
            inventory.kind !== "ASSET" ||
            !payable?.active ||
            payable.kind !== "LIABILITY")
        )
          throw new BadRequestException(
            "Purchase accounts are not configured. Contact the administrator.",
          );
        const paymentAccount =
          (paid.gt(0) || transport.gt(0)) && body.paymentAccountId
            ? await tx.account.findUnique({
                where: { id: body.paymentAccountId },
              })
            : null;
        if (
          (paid.gt(0) || transport.gt(0)) &&
          (!paymentAccount?.active ||
            paymentAccount.kind !== "ASSET" ||
            !paymentAccount.paymentMethod)
        )
          throw new BadRequestException("Choose an active payment method.");
        const transportAccount = transport.gt(0)
          ? await tx.account.upsert({
              where: { code: "5200" },
              create: { code: "5200", name: "Transport", kind: "EXPENSE" },
              update: {},
            })
          : null;
        if (
          transportAccount &&
          (!transportAccount.active || transportAccount.kind !== "EXPENSE")
        )
          throw new BadRequestException(
            "Transport expense account is not configured.",
          );
        let unitCount = 0;
        for (const item of body.items) {
          const product = products.find(
            (product) => product.id === item.productId,
          );
          if (!product?.active || !product.type.active)
            throw new BadRequestException(
              "One of the selected products is inactive or missing.",
            );
          if (product.type.trackingKind === "QUANTITY") continue;
          unitCount += item.quantity;
          if (unitCount > 500)
            throw new BadRequestException(
              "Receive at most 500 batteries per purchase.",
            );
        }
        const [number] = await tx.$queryRaw<{ number: string }[]>`
          SELECT 'PUR-' || lpad(nextval('"Purchase_number_seq"')::text, 6, '0') AS number
        `;
        const purchase = await tx.purchase.create({
          data: {
            id: requestKey,
            number: number.number,
            supplierId: supplier.id,
            orderDate: new Date(body.purchaseDate),
            supplierReference: body.reference || null,
            status: "RECEIVED",
            costPlan: {
              notes: body.notes ?? "",
              mode: "DIRECT_RECEIVE",
              transportAmount: transport.toFixed(2),
            },
          },
        });
        const posting = await tx.posting.create({
          data: {
            actorId,
            kind: operation,
            sourceCode: "purchase:" + purchase.id,
          },
        });
        const receipt = await tx.purchaseReceipt.create({
          data: {
            number: "RCV-" + purchase.id,
            purchaseId: purchase.id,
            postingId: posting.id,
            receivedDate: new Date(body.purchaseDate),
          },
        });
        let movementLine = 0;
        for (const [index, item] of body.items.entries()) {
          const product = products.find(
            (product) => product.id === item.productId,
          )!;
          const line = await tx.purchaseItem.create({
            data: {
              purchaseId: purchase.id,
              productId: product.id,
              lineNumber: index + 1,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              expectedUnitCost: item.unitPrice,
            },
          });
          const received = await tx.purchaseReceiptItem.create({
            data: {
              receiptId: receipt.id,
              purchaseItemId: line.id,
              quantity: item.quantity,
              netCost: new Prisma.Decimal(item.unitPrice).mul(item.quantity),
            },
          });
          const batch = await tx.stockBatch.create({
            data: {
              productId: product.id,
              receiptItemId: received.id,
              origin: "PURCHASE",
              originalQuantity: item.quantity,
              unitCost: item.unitPrice,
              acquiredAt: receivedAt,
            },
          });
          const movement = {
            postingId: posting.id,
            productId: product.id,
            batchId: batch.id,
            toCustody: "SHOP" as const,
            toState: "AVAILABLE" as const,
            toCondition: "GOOD" as const,
            toOwnership: "SHOP" as const,
            reason: "Purchase receiving",
            occurredAt: receivedAt,
          };
          if (product.type.trackingKind === "QUANTITY") {
            await tx.inventoryBalance.create({
              data: {
                batchId: batch.id,
                location: "SHOP",
                bucket: "AVAILABLE",
                quantity: item.quantity,
              },
            });
            await tx.stockMovement.create({
              data: {
                ...movement,
                lineNumber: ++movementLine,
                quantity: item.quantity,
              },
            });
          } else {
            const units = Array.from({ length: item.quantity }, () => {
              return {
                id: randomUUID(),
                internalCode: "BAT-" + randomUUID(),
                productId: product.id,
                batchId: batch.id,
                origin: "PURCHASE" as const,
                condition: "GOOD" as const,
                custody: "SHOP" as const,
                ownership: "SHOP" as const,
                commercialState: "AVAILABLE" as const,
              };
            });
            await tx.batteryUnit.createMany({ data: units });
            await tx.stockMovement.createMany({
              data: units.map((unit) => ({
                ...movement,
                batteryUnitId: unit.id,
                lineNumber: ++movementLine,
                quantity: 1,
              })),
            });
          }
        }
        if (total.gt(0) || transport.gt(0))
          await tx.journalEntry.create({
            data: {
              postingId: posting.id,
              postedAt: receivedAt,
              reason: "Purchase receipt " + purchase.number,
              lines: {
                create: [
                  ...(total.gt(0)
                    ? [
                        { accountId: inventory!.id, debit: total, credit: 0 },
                        {
                          accountId: payable!.id,
                          supplierId: supplier.id,
                          debit: 0,
                          credit: total,
                        },
                      ]
                    : []),
                  ...(transport.gt(0)
                    ? [
                        {
                          accountId: transportAccount!.id,
                          debit: transport,
                          credit: 0,
                        },
                        {
                          accountId: paymentAccount!.id,
                          debit: 0,
                          credit: transport,
                        },
                      ]
                    : []),
                ],
              },
            },
          });
        if (paid.gt(0)) {
          const paymentPosting = await tx.posting.create({
            data: {
              actorId,
              kind: "SUPPLIER_PAYMENT",
              sourceCode: "purchase-payment:" + purchase.id,
            },
          });
          const journal = await tx.journalEntry.create({
            data: {
              postingId: paymentPosting.id,
              postedAt: receivedAt,
              reason: "Purchase payment " + purchase.number,
              lines: {
                create: [
                  {
                    accountId: payable!.id,
                    supplierId: supplier.id,
                    debit: paid,
                    credit: 0,
                  },
                  { accountId: paymentAccount!.id, debit: 0, credit: paid },
                ],
              },
            },
          });
          await tx.payment.create({
            data: {
              number: "PAY-" + purchase.id,
              direction: "OUTGOING",
              amount: paid,
              method: paymentAccount!.paymentMethod!,
              reference: body.reference || null,
              occurredAt: receivedAt,
              supplierId: supplier.id,
              assetAccountId: paymentAccount!.id,
              journalId: journal.id,
              allocations: {
                create: { purchaseReceiptId: receipt.id, amount: paid },
              },
            },
          });
        }
        await tx.auditLog.create({
          data: {
            actorId,
            action: operation,
            resourceType: "Purchase",
            resourceId: purchase.id,
            requestId: req.requestId,
            metadata: { receiptId: receipt.id },
          },
        });
        const result = {
          id: purchase.id,
          number: purchase.number,
          receiptId: receipt.id,
          status: "RECEIVED",
          transportAmount: transport.toFixed(2),
          total: total.toFixed(2),
          paid: paid.toFixed(2),
          due: total.sub(paid).toFixed(2),
          quantity: body.items.reduce((sum, item) => sum + item.quantity, 0),
        };
        await tx.idempotencyRecord.create({
          data: {
            actorId,
            operation,
            key: requestKey,
            requestHash,
            responseStatus: 201,
            responseBody: result,
            sourceId: receipt.id,
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
