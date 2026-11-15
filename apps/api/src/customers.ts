import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  Req,
  ValidationPipe,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import type { CustomerRecord } from "../../../packages/api-client/src";
import type { AuthRequest } from "./auth";
import { DatabaseService } from "./database.service";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
class CreateCustomerDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @Transform(trim)
  @IsString()
  @Matches(/^[+0-9][0-9 ()-]{5,29}$/)
  phone!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(500) address!: string;
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  vehicleType?: string;
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  vehicleIdentifier?: string;
}
class CustomersQueryDto {
  @Transform(trim) @IsOptional() @IsString() @MaxLength(160) q?: string;
  @IsIn(["all", "active", "inactive"]) status = "all";
  @IsIn(["all", "due", "clear"]) credit = "all";
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
export const customerFields = {
  id: true,
  name: true,
  phone: true,
  address: true,
  active: true,
  createdAt: true,
  vehicles: {
    where: { active: true },
    select: { id: true, type: true, identifier: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.CustomerSelect;
type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof customerFields }>;
export const postedSales = [
  "CONFIRMED",
  "PARTIALLY_RETURNED",
  "RETURNED",
] as const;

export async function customerRecords(
  db: DatabaseService,
  rows: CustomerRow[],
): Promise<CustomerRecord[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [sales, balances] = await Promise.all([
    db.sale.groupBy({
      by: ["customerId"],
      where: { customerId: { in: ids }, status: { in: [...postedSales] } },
      _sum: { total: true },
    }),
    db.journalLine.groupBy({
      by: ["customerId"],
      where: { customerId: { in: ids }, account: { code: "1200" } },
      _sum: { debit: true, credit: true },
    }),
  ]);
  const totals = new Map(
    sales.map((sale) => [
      sale.customerId,
      sale._sum.total ?? new Prisma.Decimal(0),
    ]),
  );
  const dues = new Map(
    balances.map((balance) => [
      balance.customerId,
      (balance._sum?.debit ?? new Prisma.Decimal(0)).sub(
        balance._sum?.credit ?? 0,
      ),
    ]),
  );
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    totalSales: (totals.get(row.id) ?? new Prisma.Decimal(0)).toFixed(2),
    due: (dues.get(row.id) ?? new Prisma.Decimal(0)).toFixed(2),
  }));
}

function checkAccess(req: AuthRequest) {
  if (
    !req.currentUser!.permissions.some((permission) =>
      ["parties.customers", "sales.manage"].includes(permission),
    )
  )
    throw new ForbiddenException(
      "You do not have permission to manage customers.",
    );
}

@Controller("customers")
export class CustomersController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  async list(
    @Query(validation(CustomersQueryDto)) query: CustomersQueryDto,
    @Req() req: AuthRequest,
  ) {
    checkAccess(req);
    const [totalCustomers, activeCustomers, saleTotals, balances] =
      await this.db.$transaction([
        this.db.customer.count(),
        this.db.customer.count({ where: { active: true } }),
        this.db.sale.aggregate({
          where: { status: { in: [...postedSales] } },
          _sum: { total: true },
        }),
        this.db.journalLine.groupBy({
          by: ["customerId"],
          orderBy: { customerId: "asc" },
          where: { customerId: { not: null }, account: { code: "1200" } },
          _sum: { debit: true, credit: true },
        }),
      ]);
    const creditIds = balances
      .filter((balance) =>
        (balance._sum?.debit ?? new Prisma.Decimal(0)).gt(
          balance._sum?.credit ?? 0,
        ),
      )
      .map((balance) => balance.customerId!);
    const where: Prisma.CustomerWhereInput = {
      ...(query.status === "all" ? {} : { active: query.status === "active" }),
      ...(query.credit === "all"
        ? {}
        : {
            id:
              query.credit === "due" ? { in: creditIds } : { notIn: creditIds },
          }),
      ...(query.q
        ? {
            OR: [
              ...["name", "phone", "address"].map((field) => ({
                [field]: { contains: query.q, mode: "insensitive" },
              })),
              {
                vehicles: {
                  some: {
                    OR: [
                      {
                        identifier: { contains: query.q, mode: "insensitive" },
                      },
                      { type: { contains: query.q, mode: "insensitive" } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.customer.findMany({
        where,
        select: customerFields,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.customer.count({ where }),
    ]);
    return {
      data: {
        items: await customerRecords(this.db, rows),
        total,
        page: query.page,
        pageSize: query.pageSize,
        summary: {
          total: totalCustomers,
          active: activeCustomers,
          credit: creditIds.length,
          totalSales: (saleTotals._sum.total ?? new Prisma.Decimal(0)).toFixed(
            2,
          ),
          totalDue: balances
            .reduce(
              (sum, balance) =>
                sum.add(
                  Prisma.Decimal.max(
                    0,
                    (balance._sum?.debit ?? new Prisma.Decimal(0)).sub(
                      balance._sum?.credit ?? 0,
                    ),
                  ),
                ),
              new Prisma.Decimal(0),
            )
            .toFixed(2),
        },
      },
    };
  }

  @Post()
  async create(
    @Body(validation(CreateCustomerDto)) body: CreateCustomerDto,
    @Req() req: AuthRequest,
  ) {
    checkAccess(req);
    if (body.vehicleIdentifier && !body.vehicleType)
      throw new BadRequestException(
        "Choose a vehicle type for the vehicle identifier.",
      );
    const customer = await this.db.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          name: body.name,
          phone: body.phone,
          address: body.address,
          ...(body.vehicleType
            ? {
                vehicles: {
                  create: {
                    type: body.vehicleType,
                    identifier: body.vehicleIdentifier || null,
                  },
                },
              }
            : {}),
        },
        select: customerFields,
      });
      await tx.auditLog.create({
        data: {
          actorId: req.currentUser!.id,
          action: "CUSTOMER_CREATED",
          resourceType: "Customer",
          resourceId: created.id,
          requestId: req.requestId,
        },
      });
      return created;
    });
    return {
      data: {
        ...customer,
        createdAt: customer.createdAt.toISOString(),
        totalSales: "0.00",
        due: "0.00",
      },
    };
  }
}
