import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { DashboardData } from "../../../packages/api-client/src";
import { DatabaseService } from "./database.service";

export function dhakaDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function businessRange(from = dhakaDate(), to = dhakaDate()) {
  for (const value of [from, to]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      throw new BadRequestException("Use valid YYYY-MM-DD dates.");
  }
  const start = new Date(from + "T00:00:00+06:00");
  const end = new Date(new Date(to + "T00:00:00+06:00").getTime() + 86400000);
  if (end <= start || end.getTime() - start.getTime() > 366 * 86400000)
    throw new BadRequestException(
      "Choose an ordered date range of at most 366 days.",
    );
  return { from, to, start, end };
}

@Injectable()
export class DashboardService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async get(
    finance: boolean,
    from?: string,
    to?: string,
  ): Promise<DashboardData> {
    const range = businessRange(from, to);
    const availableWhere = {
      condition: "GOOD",
      custody: "SHOP",
      ownership: "SHOP",
      commercialState: "AVAILABLE",
      reservedCustomerId: null,
      reservedReplacementId: null,
    } as const;
    const [
      products,
      customers,
      batteries,
      parts,
      pendingReplacements,
      sentToCompany,
      replacementsReceived,
      recent,
      stocks,
      unitGroups,
      claimGroups,
      allParts,
    ] = await Promise.all([
      this.db.product.count({ where: { active: true } }),
      this.db.customer.count({ where: { active: true } }),
      this.db.batteryUnit.count({
        where: { ...availableWhere, product: { active: true } },
      }),
      this.db.inventoryBalance.aggregate({
        _sum: { quantity: true },
        where: {
          location: "SHOP",
          bucket: "AVAILABLE",
          batch: {
            product: { active: true, type: { trackingKind: "QUANTITY" } },
          },
        },
      }),
      this.db.replacementRecord.count({
        where: { NOT: { status: "COMPLETED" }, outcomeResolvedAt: null },
      }),
      this.db.replacementRecord.count({
        where: { status: { in: ["SENT_TO_COMPANY", "UNDER_REVIEW"] } },
      }),
      this.db.replacementRecord.count({
        where: {
          status: {
            in: ["REPLACEMENT_RECEIVED", "READY_FOR_CUSTOMER_DELIVERY"],
          },
        },
      }),
      this.db.sale.findMany({
        where: {
          status: { in: ["CONFIRMED", "PARTIALLY_RETURNED", "RETURNED"] },
          soldAt: { gte: range.start, lt: range.end },
        },
        select: {
          id: true,
          invoiceNumber: true,
          soldAt: true,
          total: true,
          status: true,
          customer: { select: { id: true, name: true, phone: true } },
          paymentAllocations: {
            where: {
              reversedAllocationId: null,
              reversal: { is: null },
              payment: { reversedPaymentId: null, reversal: { is: null } },
            },
            select: { amount: true },
          },
        },
        orderBy: { soldAt: "desc" },
        take: 5,
      }),
      this.db.$queryRaw<
        { id: string; name: string; quantity: string; threshold: string }[]
      >`
        SELECT p.id, p.name, p."lowStockThreshold"::text AS threshold,
          (CASE WHEN t."trackingKind" = 'BATTERY_UNIT' THEN
            (SELECT COUNT(*) FROM "BatteryUnit" u WHERE u."productId"=p.id AND u.condition='GOOD' AND u.custody='SHOP' AND u.ownership='SHOP' AND u."commercialState"='AVAILABLE' AND u."reservedCustomerId" IS NULL AND u."reservedReplacementId" IS NULL)
          ELSE COALESCE((SELECT SUM(b.quantity) FROM "InventoryBalance" b JOIN "StockBatch" s ON s.id=b."batchId" WHERE s."productId"=p.id AND b.location='SHOP' AND b.bucket='AVAILABLE'),0) END)::text AS quantity
        FROM "Product" p JOIN "ProductType" t ON t.id=p."typeId" WHERE p.active=true AND p."lowStockThreshold">0`,
      this.db.batteryUnit.groupBy({
        by: ["condition", "custody", "ownership", "commercialState"],
        where: { commercialState: { not: "RETIRED" } },
        _count: { _all: true },
      }),
      this.db.replacementRecord.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      this.db.inventoryBalance.aggregate({
        _sum: { quantity: true },
        where: { batch: { product: { type: { trackingKind: "QUANTITY" } } } },
      }),
    ]);
    const lowStock = stocks.filter((item) =>
      new Prisma.Decimal(item.quantity).lte(item.threshold),
    );
    const result: DashboardData = {
      businessDate: dhakaDate(),
      from: range.from,
      to: range.to,
      counts: {
        products,
        customers,
        availableStock: new Prisma.Decimal(batteries)
          .add(parts._sum.quantity ?? 0)
          .toString(),
        pendingReplacements,
        sentToCompany,
        replacementsReceived,
        lowStock: lowStock.length,
      },
      lowStock: lowStock.slice(0, 5),
      recentSales: recent.map(({ paymentAllocations, ...sale }) => {
        const paid = paymentAllocations.reduce(
          (sum, allocation) => sum.add(allocation.amount),
          new Prisma.Decimal(0),
        );
        return {
          ...sale,
          customer: sale.customer.name,
          customerId: sale.customer.id,
          customerPhone: sale.customer.phone,
          total: sale.total.toFixed(2),
          paid: paid.toFixed(2),
          due: sale.total.sub(paid).toFixed(2),
          soldAt: sale.soldAt?.toISOString() ?? null,
        };
      }),
      salesTrend: [],
      stock: {
        batteriesAvailable: batteries,
        partsAvailable: (
          parts._sum.quantity ?? new Prisma.Decimal(0)
        ).toString(),
        accountedUnits: new Prisma.Decimal(
          unitGroups
            .filter((group) => group.ownership === "SHOP")
            .reduce((sum, group) => sum + group._count._all, 0),
        )
          .add(allParts._sum.quantity ?? 0)
          .toString(),
        replaceable: unitGroups
          .filter(
            (group) =>
              group.ownership === "SHOP" &&
              group.condition === "FAULTY" &&
              group.custody === "SHOP",
          )
          .reduce((sum, group) => sum + group._count._all, 0),
        reserved: unitGroups
          .filter((group) => group.commercialState === "RESERVED")
          .reduce((sum, group) => sum + group._count._all, 0),
      },
      replacementStages: {
        total: claimGroups.reduce((sum, group) => sum + group._count._all, 0),
        pendingReturn:
          claimGroups.find((group) => group.status === "PENDING_RETURN")?._count
            ._all ?? 0,
        sentToCompany:
          claimGroups.find((group) => group.status === "SENT_TO_COMPANY")
            ?._count._all ?? 0,
        underReview:
          claimGroups.find((group) => group.status === "UNDER_REVIEW")?._count
            ._all ?? 0,
        received:
          claimGroups.find((group) => group.status === "REPLACEMENT_RECEIVED")
            ?._count._all ?? 0,
        readyForDelivery:
          claimGroups.find(
            (group) => group.status === "READY_FOR_CUSTOMER_DELIVERY",
          )?._count._all ?? 0,
      },
    };
    if (finance) {
      const [allBalances, receipts, cash, stockValue] = await Promise.all([
        this.db.journalLine.groupBy({
          by: ["accountId", "customerId", "supplierId"],
          where: { account: { code: { in: ["1200", "2100"] } } },
          _sum: { debit: true, credit: true },
        }),
        this.db.purchaseReceiptItem.aggregate({
          _sum: { netCost: true },
          where: {
            receipt: {
              purchase: { status: { not: "CANCELLED" } },
              receivedDate: {
                gte: new Date(range.from),
                lte: new Date(range.to),
              },
            },
          },
        }),
        this.db.payment.aggregate({
          _sum: { amount: true },
          where: {
            direction: "INCOMING",
            method: "CASH",
            occurredAt: { gte: range.start, lt: range.end },
            reversedPaymentId: null,
            reversal: { is: null },
          },
        }),
        this.db.$queryRaw<{ amount: string }[]>`
          SELECT COALESCE(SUM(v.amount), 0)::text AS amount FROM (
            SELECT s."unitCost" AS amount
            FROM "BatteryUnit" u JOIN "StockBatch" s ON s.id=u."batchId"
            JOIN "Product" p ON p.id=u."productId"
            WHERE p.active=true AND u.condition='GOOD' AND u.custody='SHOP'
              AND u.ownership='SHOP' AND u."commercialState"='AVAILABLE'
              AND u."reservedCustomerId" IS NULL AND u."reservedReplacementId" IS NULL
            UNION ALL
            SELECT b.quantity * s."unitCost" AS amount
            FROM "InventoryBalance" b JOIN "StockBatch" s ON s.id=b."batchId"
            JOIN "Product" p ON p.id=s."productId" JOIN "ProductType" t ON t.id=p."typeId"
            WHERE p.active=true AND t."trackingKind"='QUANTITY'
              AND b.location='SHOP' AND b.bucket='AVAILABLE' AND b.quantity>0
          ) v`,
      ]);
      const accountIds = await this.db.account.findMany({
        where: { code: { in: ["1200", "2100"] } },
        select: { id: true, code: true },
      });
      const codes = new Map(accountIds.map((a) => [a.id, a.code]));
      let customerDues = new Prisma.Decimal(0);
      let supplierDues = new Prisma.Decimal(0);
      for (const balance of allBalances) {
        const debit = balance._sum.debit ?? new Prisma.Decimal(0);
        const credit = balance._sum.credit ?? new Prisma.Decimal(0);
        if (codes.get(balance.accountId) === "1200")
          customerDues = customerDues.add(
            Prisma.Decimal.max(0, debit.sub(credit)),
          );
        if (codes.get(balance.accountId) === "2100")
          supplierDues = supplierDues.add(
            Prisma.Decimal.max(0, credit.sub(debit)),
          );
      }
      const transportLines = await this.db.journalLine.findMany({
        where: {
          account: { code: "5200", kind: "EXPENSE" },
          entry: {
            postedAt: { gte: range.start, lt: range.end },
            reversal: { is: null },
            OR: [
              { reversedEntryId: null },
              { posting: { kind: "TRANSACTION_RESTORED" } },
            ],
          },
        },
        select: {
          id: true,
          debit: true,
          credit: true,
          entry: {
            select: {
              postedAt: true,
              reason: true,
              posting: {
                select: {
                  purchaseReceipt: {
                    select: {
                      purchase: { select: { supplierReference: true } },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ entry: { postedAt: "desc" } }, { id: "desc" }],
      });
      const companyPayments = await this.db.payment.findMany({
        where: {
          supplierId: { not: null },
          reversedPaymentId: null,
          reversal: { is: null },
        },
        select: {
          id: true,
          occurredAt: true,
          amount: true,
          direction: true,
          supplier: { select: { name: true, company: true } },
          allocations: {
            where: { reversedAllocationId: null, reversal: { is: null } },
            select: {
              purchaseReceipt: {
                select: { purchase: { select: { supplierReference: true } } },
              },
            },
          },
        },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 100,
      });
      const companyTotals = await this.db.payment.aggregate({
        where: {
          supplierId: { not: null },
          reversedPaymentId: null,
          reversal: { is: null },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      // Accounts shows the current sales book across all invoice dates. A
      // cancellation posted today must not become negative income for today
      // while its original invoice belonged to an earlier day.
      const currentSalesLines = await this.db.journalLine.findMany({
        where: {
          account: { code: { in: ["4100", "5100"] } },
          entry: {
            posting: {
              OR: [
                {
                  sale: {
                    status: {
                      in: ["CONFIRMED", "PARTIALLY_RETURNED", "RETURNED"],
                    },
                  },
                },
                {
                  salesReturn: {
                    sale: {
                      status: {
                        in: ["CONFIRMED", "PARTIALLY_RETURNED", "RETURNED"],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        select: {
          debit: true,
          credit: true,
          account: { select: { code: true } },
          entry: {
            select: {
              posting: {
                select: {
                  sale: { select: { soldAt: true } },
                  salesReturn: {
                    select: { sale: { select: { soldAt: true } } },
                  },
                },
              },
            },
          },
        },
      });
      const daily = new Map<
        string,
        { amount: Prisma.Decimal; grossProfit: Prisma.Decimal }
      >();
      let revenue = new Prisma.Decimal(0),
        cogs = new Prisma.Decimal(0);
      let salesIncome = new Prisma.Decimal(0),
        salesCost = new Prisma.Decimal(0);
      for (const line of currentSalesLines) {
        const income =
          line.account.code === "4100"
            ? line.credit.sub(line.debit)
            : new Prisma.Decimal(0);
        const cost =
          line.account.code === "5100"
            ? line.debit.sub(line.credit)
            : new Prisma.Decimal(0);
        salesIncome = salesIncome.add(income);
        salesCost = salesCost.add(cost);
        const soldAt =
          line.entry.posting.sale?.soldAt ??
          line.entry.posting.salesReturn?.sale.soldAt;
        if (soldAt && soldAt >= range.start && soldAt < range.end) {
          revenue = revenue.add(income);
          cogs = cogs.add(cost);
          const date = dhakaDate(soldAt),
            point = daily.get(date) ?? {
              amount: new Prisma.Decimal(0),
              grossProfit: new Prisma.Decimal(0),
            };
          point.amount = point.amount.add(income);
          point.grossProfit = point.grossProfit.add(income).sub(cost);
          daily.set(date, point);
        }
      }
      const trend = [...daily]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, point]) => ({
          date,
          amount: point.amount.toFixed(2),
          grossProfit: point.grossProfit.toFixed(2),
        }));
      result.financials = {
        salesIncome: salesIncome.toFixed(2),
        salesProfit: salesIncome.sub(salesCost).toFixed(2),
        companyTransactionCount: companyTotals._count._all,
        companyTransactionAmount: (
          companyTotals._sum.amount ?? new Prisma.Decimal(0)
        ).toFixed(2),
        companyTransactions: companyPayments.map((payment) => ({
          id: payment.id,
          date: dhakaDate(payment.occurredAt),
          company: payment.supplier!.company?.trim() || payment.supplier!.name,
          challanNumber:
            [
              ...new Set(
                payment.allocations
                  .map(
                    (allocation) =>
                      allocation.purchaseReceipt?.purchase.supplierReference,
                  )
                  .filter(Boolean),
              ),
            ].join(", ") || null,
          type: payment.direction === "OUTGOING" ? "Payment" : "Refund",
          amount: payment.amount.toFixed(2),
        })),
        transportExpenses: transportLines
          .reduce(
            (sum, line) => sum.add(line.debit).sub(line.credit),
            new Prisma.Decimal(0),
          )
          .toFixed(2),
        transportTransactions: transportLines.map((line) => ({
          id: line.id,
          date: dhakaDate(line.entry.postedAt),
          description: line.entry.reason ?? "Purchase transport",
          challanNumber:
            line.entry.posting.purchaseReceipt?.purchase.supplierReference ??
            null,
          amount: line.debit.sub(line.credit).toFixed(2),
        })),
        availableStockPurchaseValue: new Prisma.Decimal(
          stockValue[0]?.amount ?? 0,
        ).toFixed(2),
        todaySales: revenue.toFixed(2),
        todayPurchases: (
          receipts._sum.netCost ?? new Prisma.Decimal(0)
        ).toFixed(2),
        todayCashReceived: (cash._sum.amount ?? new Prisma.Decimal(0)).toFixed(
          2,
        ),
        grossProfit: revenue.sub(cogs).toFixed(2),
        customerDues: customerDues.toFixed(2),
        supplierDues: supplierDues.toFixed(2),
      };
      result.salesTrend = trend;
    }
    return result;
  }
}
