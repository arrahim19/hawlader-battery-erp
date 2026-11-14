import { Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { settings } from "./config";
@Injectable()
export class DatabaseService extends PrismaClient {
  constructor() {
    super({
      adapter: new PrismaPg({
        connectionString: settings().databaseUrl,
        // Prisma's timestamp parameters are UTC; keep parsing independent of the
        // host PostgreSQL timezone. Business-day grouping explicitly uses Dhaka.
        options: "-c timezone=UTC",
        max: 10,
        // Allow a suspended Neon compute to wake before timing out.
        connectionTimeoutMillis: 30000,
      }),
    });
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
