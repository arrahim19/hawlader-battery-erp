import { config } from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";
config({ path: path.resolve(__dirname, "../../.env"), quiet: true });
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url:
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.DATABASE_URL ||
      "postgresql://unconfigured@127.0.0.1:55432/hawlader_erp",
  },
});
