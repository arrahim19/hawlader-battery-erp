import { randomUUID } from "node:crypto";
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";
import type { AuthRequest } from "./auth";

export function databaseUnavailable(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) return true;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (["P1001", "P1002", "P1017", "P2021", "P2022"].includes(error.code))
    return true;
  // Driver adapters wrap raw-query connection failures as P2010, not P1001.
  const adapter = error.meta?.driverAdapterError;
  if (!adapter || typeof adapter !== "object" || !("cause" in adapter))
    return false;
  const cause = adapter.cause;
  return Boolean(
    cause &&
    typeof cause === "object" &&
    "kind" in cause &&
    [
      "DatabaseNotReachable",
      "AuthenticationFailed",
      "DatabaseDoesNotExist",
      "ConnectionClosed",
      "SocketTimeout",
      "TooManyConnections",
      "TableDoesNotExist",
    ].includes(String(cause.kind)),
  );
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger("ApiError");
  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<AuthRequest>();
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500;
    let message = "An unexpected error occurred.";
    let code = "INTERNAL_ERROR";
    let fields: unknown;
    if (error instanceof HttpException) {
      status = error.getStatus();
      const response = error.getResponse();
      const details =
        typeof response === "object" && response !== null
          ? (response as Record<string, unknown>)
          : {};
      fields = Array.isArray(details.message)
        ? { _form: details.message }
        : undefined;
      message =
        typeof response === "string"
          ? response
          : typeof details.message === "string"
            ? details.message
            : Array.isArray(details.message)
              ? "Please check your request fields."
              : error.message;
      code =
        (
          {
            400: "VALIDATION_ERROR",
            401: "UNAUTHENTICATED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            409: "CONFLICT",
            429: "RATE_LIMITED",
            503: "DATABASE_UNAVAILABLE",
          } as Record<number, string>
        )[status] ?? "REQUEST_FAILED";
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      status = 409;
      code = "DUPLICATE_RECORD";
      message = "A record with this identifier already exists.";
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2003", "P2025"].includes(error.code)
    ) {
      status = 409;
      code = "REFERENCED_RECORD";
      message =
        "The record changed or is referenced by another record. Refresh and try again.";
    } else if (databaseUnavailable(error)) {
      status = 503;
      code = "DATABASE_UNAVAILABLE";
      message =
        "Database is unavailable or migrations are missing. Follow the development setup instructions.";
    }
    if (status === 500)
      this.logger.error({
        requestId: req.requestId,
        type: error instanceof Error ? error.name : "UnknownError",
      });
    if (status === 429) res.setHeader("Retry-After", "900");
    res.status(status).json({
      error: {
        code,
        message,
        requestId: req.requestId ?? randomUUID(),
        ...(fields ? { fields } : {}),
      },
    });
  }
}
