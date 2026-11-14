import { config } from "dotenv";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env"), quiet: true });
if (!process.env.DATABASE_URL) throw new Error("Run npm run setup first.");
if (process.env.NODE_ENV === "production")
  throw new Error("Local database helper is development-only.");
const url = new URL(process.env.DATABASE_URL);
if (
  url.hostname !== "127.0.0.1" ||
  url.port !== "55432" ||
  url.pathname !== "/hawlader_erp"
) {
  throw new Error(
    "Helper only manages the isolated 127.0.0.1:55432/hawlader_erp cluster. Use manual setup for other URLs.",
  );
}
const bin =
  process.env.PG_BIN_DIR ??
  (process.platform === "win32"
    ? "C:/Program Files/PostgreSQL/18/bin"
    : "/usr/lib/postgresql/18/bin");
const executable = (name) =>
  path.join(bin, name + (process.platform === "win32" ? ".exe" : ""));
if (!existsSync(executable("pg_ctl")))
  throw new Error(
    "PostgreSQL tools not found. Set PG_BIN_DIR; see docs/DEVELOPMENT.md for Docker/manual setup.",
  );
const local = path.join(root, ".local");
const data = path.join(local, "postgres");
mkdirSync(local, { recursive: true });
function run(name, args, allowed = [0]) {
  // A background Windows postgres process can inherit captured pipe handles
  // even after pg_ctl exits. Ignore handles for start; server logs go to -l.
  const result = spawnSync(executable(name), args, {
    cwd: root,
    windowsHide: true,
    encoding: "utf8",
    stdio:
      name === "pg_ctl" && args.includes("start")
        ? "ignore"
        : ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (!allowed.includes(result.status))
    throw new Error(name + " failed: " + result.stdout + result.stderr);
  return result;
}
if (process.argv[2] === "stop") {
  if (existsSync(path.join(data, "PG_VERSION")))
    run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], [0, 3]);
  console.log(
    "Project-local PostgreSQL stopped; existing system service untouched.",
  );
  process.exit(0);
}
if (!existsSync(path.join(data, "PG_VERSION"))) {
  const passwordFile = path.join(local, "init-password.tmp");
  writeFileSync(passwordFile, decodeURIComponent(url.password), {
    mode: 0o600,
    flag: "wx",
  });
  try {
    run("initdb", [
      "-D",
      data,
      "-U",
      decodeURIComponent(url.username),
      "--pwfile=" + passwordFile,
      "--auth=scram-sha-256",
      "--encoding=UTF8",
      "--locale=C",
    ]);
  } finally {
    unlinkSync(passwordFile);
  }
}
const status = run("pg_ctl", ["-D", data, "status"], [0, 3]);
if (status.status !== 0)
  run("pg_ctl", [
    "-D",
    data,
    "-l",
    path.join(local, "postgres.log"),
    "-o",
    "-h 127.0.0.1 -p 55432",
    "-w",
    "start",
  ]);
const adminUrl = new URL(url);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const client = new pg.Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  const result = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    ["hawlader_erp"],
  );
  if (!result.rowCount) await client.query('CREATE DATABASE "hawlader_erp"');
} finally {
  await client.end();
}
console.log(
  "Isolated PostgreSQL ready at 127.0.0.1:55432, database hawlader_erp. Run npm run db:migrate, then npm run db:admin.",
);
