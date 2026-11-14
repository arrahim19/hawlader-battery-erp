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
      suppliers,
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
      this.db.supplier.count({ where: { active: true } }),
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
          customer: { select: { name: true } },
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
        suppliers,
        availableStock: new Prisma.Decimal(batteries)
          .add(parts._sum.quantity ?? 0)
          .toString(),
        pendingReplacements,
        sentToCompany,
        replacementsReceived,
        lowStock: lowStock.length,
      },
      lowStock: lowStock.slice(0, 5),
      recentSales: recent.map((sale) => ({
        ...sale,
        customer: sale.customer.name,
        total: sale.total.toFixed(2),
        soldAt: sale.soldAt?.toISOString() ?? null,
      })),
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
      const [lines, allBalances, receipts, cash, trend] = await Promise.all([
        this.db.journalLine.findMany({
          where: {
            entry: { postedAt: { gte: range.start, lt: range.end } },
            account: { code: { in: ["4100", "5100"] } },
          },
          select: {
            debit: true,
            credit: true,
            account: { select: { code: true } },
          },
        }),
        this.db.journalLine.groupBy({
          by: ["accountId", "customerId", "supplierId"],
          where: { account: { code: { in: ["1200", "2100"] } } },
          _sum: { debit: true, credit: true },
        }),
        this.db.purchaseReceiptItem.aggregate({
          _sum: { netCost: true },
          where: {
            receipt: {
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
        this.db.$queryRaw<
          { date: string; amount: string; grossProfit: string }[]
        >`
          SELECT to_char(e."postedAt" AT TIME ZONE 'Asia/Dhaka','YYYY-MM-DD') AS date,
            SUM(CASE WHEN a.code='4100' THEN l.credit-l.debit ELSE 0 END)::text AS amount,
            SUM(l.credit-l.debit)::text AS "grossProfit"
          FROM "JournalLine" l JOIN "JournalEntry" e ON e.id=l."entryId" JOIN "Account" a ON a.id=l."accountId"
          WHERE a.code IN ('4100','5100') AND e."postedAt">=${range.start} AND e."postedAt"<${range.end}
          GROUP BY 1 ORDER BY 1`,
      ]);
      const accountIds = await this.db.account.findMany({
        where: { code: { in: ["1200", "2100"] } },
        select: { id: true, code: true },
      });
      const codes = new Map(accountIds.map((a) => [a.id, a.code]));
      let revenue = new Prisma.Decimal(0);
      let cogs = new Prisma.Decimal(0);
      for (const line of lines) {
        if (line.account.code === "4100")
          revenue = revenue.add(line.credit.sub(line.debit));
        else cogs = cogs.add(line.debit.sub(line.credit));
      }
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
      result.financials = {
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
