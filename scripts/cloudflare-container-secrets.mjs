import { config } from "dotenv";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env"), quiet: true });
const origin = process.argv[2];
if (!origin) {
  throw new Error("Usage: npm run cf:secrets -- https://YOUR-ERP-HOST");
}
const parsed = new URL(origin);
if (
  parsed.protocol !== "https:" ||
  parsed.username ||
  parsed.password ||
  parsed.pathname !== "/" ||
  parsed.search ||
  parsed.hash
) {
  throw new Error("Supply an HTTPS origin without a path or credentials.");
}
const database = process.env.DATABASE_URL;
if (!database || database.includes("CHANGE_ME")) {
  throw new Error(
    "Set the production DATABASE_URL in your ignored .env first.",
  );
}
const databaseUrl = new URL(database);
if (
  !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
  ["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname)
) {
  throw new Error("Cloudflare needs a remotely reachable PostgreSQL database.");
}

// Credentials travel only over stdin. Never write them to a deployment file or
// include them in command arguments/build layers. Keep CSRF stable on updates.
const secret = process.env.CSRF_SECRET;
const payload = {
  DATABASE_URL: database,
  APP_ORIGIN: parsed.origin,
  CSRF_SECRET:
    secret && secret.length >= 32 && !secret.startsWith("REPLACE_")
      ? secret
      : randomBytes(48).toString("hex"),
};
const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/wrangler/bin/wrangler.js"),
    "secret",
    "bulk",
    "--config",
    path.join(root, "apps/cloudflare/wrangler.jsonc"),
  ],
  { cwd: root, stdio: ["pipe", "inherit", "inherit"], windowsHide: true },
);
child.stdin.on("error", () => {});
child.stdin.end(JSON.stringify(payload));
child.on("error", () => {
  console.error("Could not start Wrangler. Run npm ci first.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
