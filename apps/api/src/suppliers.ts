import {
  Body,
  Controller,
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
import { Permissions, type AuthRequest } from "./auth";
import { DatabaseService } from "./database.service";

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

class CreateSupplierDto {
  @Transform(trimmed)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Transform(trimmed)
  @IsString()
  @Matches(/^[+0-9][0-9 ()-]{5,29}$/)
  phone!: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string | null;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;
}

class SupplierQueryDto {
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  q?: string;

  @IsIn(["all", "active", "inactive"])
  status = "all";

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 10;
}

const contactFields = {
  id: true,
  name: true,
  company: true,
  phone: true,
  address: true,
  active: true,
  createdAt: true,
} as const;

@Controller("suppliers")
@Permissions("parties.suppliers")
export class SuppliersController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  async list(
    @Query(
      new ValidationPipe({
        expectedType: SupplierQueryDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: SupplierQueryDto,
  ) {
    const where: Prisma.SupplierWhereInput = {
      ...(query.status === "all" ? {} : { active: query.status === "active" }),
      ...(query.q
        ? {
            OR: ["name", "company", "phone", "address"].map((field) => ({
              [field]: { contains: query.q, mode: "insensitive" },
            })),
          }
        : {}),
    };
    const [items, total, totalSuppliers, activeSuppliers] =
      await this.db.$transaction([
        this.db.supplier.findMany({
          where,
          select: contactFields,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.db.supplier.count({ where }),
        this.db.supplier.count(),
        this.db.supplier.count({ where: { active: true } }),
      ]);
    return {
      data: {
        items,
        total,
        page: query.page,
        pageSize: query.pageSize,
        summary: { total: totalSuppliers, active: activeSuppliers },
      },
    };
  }

  @Post()
  async create(
    @Body(
      new ValidationPipe({
        expectedType: CreateSupplierDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    body: CreateSupplierDto,
    @Req() req: AuthRequest,
  ) {
    const supplier = await this.db.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: {
          name: body.name,
          phone: body.phone,
          company: body.company || null,
          address: body.address || null,
        },
        select: contactFields,
      });
      await tx.auditLog.create({
        data: {
          actorId: req.currentUser!.id,
          action: "SUPPLIER_CREATED",
          resourceType: "Supplier",
          resourceId: created.id,
          requestId: req.requestId,
        },
      });
      return created;
    });
    return { data: supplier };
  }
}
