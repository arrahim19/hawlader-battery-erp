import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
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
import { createHash } from "node:crypto";
import { Transform, Type } from "class-transformer";
import {
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
} from "class-validator";
import type { Response } from "express";
import { Permissions, type AuthRequest } from "./auth";
import { businessRange, dhakaDate } from "./dashboard";
import { DatabaseService } from "./database.service";

const categories = ["Office Expense", "Transport", "Others"];
const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;
class CreateExpenseDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) expenseDate!: string;
  @IsIn(categories) category!: string;
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description = "";
  @Matches(/^\d{1,14}(?:\.\d{1,2})?$/) amount!: string;
  @IsOptional() @IsUUID() paymentAccountId?: string;
}
class ExpensesQueryDto {
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

@Controller("expenses")
@Permissions("finance.read")
export class ExpensesController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get("options")
  async options() {
    const cash = await this.db.account.findFirst({
      where: {
        code: "1100",
        active: true,
        kind: "ASSET",
        paymentMethod: "CASH",
      },
      select: { id: true },
    });
    return {
      data: {
        categories,
        cashAvailable: Boolean(cash),
        paymentAccounts: await this.db.account.findMany({
          where: { active: true, kind: "ASSET", paymentMethod: { not: null } },
          select: { id: true, name: true, paymentMethod: true },
          orderBy: { code: "asc" },
        }),
      },
    };
  }

  @Get()
  async list(@Query(validation(ExpensesQueryDto)) query: ExpensesQueryDto) {
    // One expense debit per journal is counted once, including purchase transport.
    const lines = await this.db.journalLine.findMany({
      where: {
        account: { kind: "EXPENSE", code: { not: "5100" } },
        debit: { gt: 0 },
        entry: {
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
        account: { select: { code: true, name: true } },
        entry: {
          select: {
            postedAt: true,
            createdAt: true,
            reason: true,
            posting: {
              select: {
                purchaseReceipt: {
                  select: { purchase: { select: { supplierReference: true } } },
                },
              },
            },
            expense: {
              select: {
                id: true,
                incurredDate: true,
                description: true,
                category: { select: { name: true } },
              },
            },
            lines: {
              where: {
                credit: { gt: 0 },
                account: { kind: "ASSET", paymentMethod: { not: null } },
              },
              select: { account: { select: { name: true } } },
            },
          },
        },
      },
      orderBy: [
        { entry: { postedAt: "desc" } },
        { entry: { createdAt: "desc" } },
        { id: "desc" },
      ],
    });
    const byCategory = new Map<string, Prisma.Decimal>();
    let total = new Prisma.Decimal(0);
    const items = lines.map((line) => {
      const expense = line.entry.expense;
      const category =
        expense?.category.name ??
        (line.account.code === "5200" ? "Transport" : line.account.name);
      const amount = line.debit.sub(line.credit);
      total = total.add(amount);
      byCategory.set(
        category,
        (byCategory.get(category) ?? new Prisma.Decimal(0)).add(amount),
      );
      return {
        id: line.id,
        expenseId: expense?.id ?? null,
        date:
          expense?.incurredDate.toISOString().slice(0, 10) ??
          dhakaDate(line.entry.postedAt),
        description: expense?.description ?? line.entry.reason ?? "Expense",
        challanNumber:
          line.entry.posting.purchaseReceipt?.purchase.supplierReference ??
          null,
        category,
        amount: amount.toFixed(2),
        paymentAccount:
          line.entry.lines.map((item) => item.account.name).join(", ") || "—",
        source: expense
          ? "MANUAL"
          : line.account.code === "5200"
            ? "PURCHASE_TRANSPORT"
            : "OTHER",
      };
    });
    return {
      data: {
        items: items.slice(
          (query.page - 1) * query.pageSize,
          query.page * query.pageSize,
        ),
        total: items.length,
        page: query.page,
        pageSize: query.pageSize,
        summary: {
          total: total.toFixed(2),
          byCategory: [...byCategory].map(([name, amount]) => ({
            name,
            amount: amount.toFixed(2),
          })),
        },
      },
    };
  }

  @Post()
  @Permissions("finance.read", "finance.write")
  async create(
    @Body(validation(CreateExpenseDto)) body: CreateExpenseDto,
    @Headers("idempotency-key") key: string,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!key || !isUUID(key))
      throw new BadRequestException("A UUID Idempotency-Key is required.");
    businessRange(body.expenseDate, body.expenseDate);
    const amount = new Prisma.Decimal(body.amount);
    if (amount.lte(0))
      throw new BadRequestException(
        "Expense amount must be greater than zero.",
      );
    const actorId = req.currentUser!.id,
      operation = "EXPENSE_CREATE";
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify([
          body.expenseDate,
          body.category,
          body.description,
          amount.toFixed(2),
          body.paymentAccountId ?? "CASH",
        ]),
      )
      .digest("hex");
    let replayed = false;
    const result = await this.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${actorId + ":" + operation + ":" + key}, 0))`;
        const prior = await tx.idempotencyRecord.findUnique({
          where: { actorId_operation_key: { actorId, operation, key } },
        });
        if (prior) {
          if (prior.requestHash !== requestHash)
            throw new ConflictException(
              "This expense was already submitted with different details.",
            );
          replayed = true;
          return prior.responseBody;
        }
        const paymentAccount = body.paymentAccountId
          ? await tx.account.findUnique({
              where: { id: body.paymentAccountId },
            })
          : await tx.account.findFirst({
              where: {
                code: "1100",
                active: true,
                kind: "ASSET",
                paymentMethod: "CASH",
              },
            });
        if (
          !paymentAccount?.active ||
          paymentAccount.kind !== "ASSET" ||
          !paymentAccount.paymentMethod
        )
          throw new BadRequestException("Choose an active payment account.");
        const code = body.category === "Transport" ? "5200" : "6100";
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('expense-catalog', 0))`;
        const account = await tx.account.upsert({
          where: { code },
          create: {
            code,
            name: code === "5200" ? "Transport" : "Operating expenses",
            kind: "EXPENSE",
          },
          update: {},
        });
        if (!account.active || account.kind !== "EXPENSE")
          throw new BadRequestException(
            "The expense account is not configured.",
          );
        const category = await tx.expenseCategory.upsert({
          where: { name: body.category },
          create: { name: body.category, accountId: account.id },
          update: {},
          include: { account: true },
        });
        if (
          !category.active ||
          !category.account.active ||
          category.account.kind !== "EXPENSE" ||
          category.account.code === "5100"
        )
          throw new BadRequestException(
            "Choose an active operating expense category.",
          );
        const postedAt = new Date(body.expenseDate + "T12:00:00+06:00");
        const posting = await tx.posting.create({
          data: {
            actorId,
            kind: operation,
            sourceCode: "expense:" + key,
            reason: body.description,
          },
        });
        const journal = await tx.journalEntry.create({
          data: {
            postingId: posting.id,
            postedAt,
            reason: body.description,
            lines: {
              create: [
                { accountId: category.accountId, debit: amount },
                { accountId: paymentAccount.id, credit: amount },
              ],
            },
          },
        });
        const expense = await tx.expense.create({
          data: {
            id: key,
            description: body.description,
            amount,
            incurredDate: new Date(body.expenseDate),
            categoryId: category.id,
            journalId: journal.id,
          },
        });
        // This form records an immediately paid expense: one journal recognizes it
        // and pays it, and the linked settlement never repeats the expense debit.
        await tx.expenseSettlement.create({
          data: {
            expenseId: expense.id,
            amount,
            settledAt: postedAt,
            assetAccountId: paymentAccount.id,
            journalId: journal.id,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: operation,
            resourceType: "Expense",
            resourceId: expense.id,
            reason: body.description,
            requestId: req.requestId,
            metadata: {
              amount: amount.toFixed(2),
              category: body.category,
              paymentAccountId: paymentAccount.id,
            },
          },
        });
        const response = {
          id: expense.id,
          date: body.expenseDate,
          category: category.name,
          description: expense.description,
          amount: amount.toFixed(2),
          paymentAccount: paymentAccount.name,
        };
        await tx.idempotencyRecord.create({
          data: {
            actorId,
            operation,
            key,
            requestHash,
            responseStatus: 201,
            responseBody: response,
            sourceId: expense.id,
          },
        });
        return response;
      },
      { timeout: 30000, maxWait: 10000 },
    );
    if (replayed) res.setHeader("Idempotency-Replayed", "true");
    return { data: result };
  }
}
