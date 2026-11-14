import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, ".env");
if (existsSync(file)) {
  console.log(".env already exists; preserved.");
  process.exit(0);
}
const password = randomBytes(24).toString("hex");
const source = readFileSync(path.join(root, ".env.example"), "utf8")
  .replace("CHANGE_ME", password)
  .replace(
    "REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS",
    randomBytes(48).toString("hex"),
  );
writeFileSync(file, source, { mode: 0o600, flag: "wx" });
console.log(
  "Created ignored .env with random local database credentials and CSRF secret.",
);
