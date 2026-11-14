import { config } from "dotenv";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
config({ path: path.join(root, ".env.cloudflare"), quiet: true });
const apiUrl = process.argv[2] ?? process.env.API_URL;
const secret = process.env.API_PROXY_SECRET;
if (!apiUrl || !secret || secret.length < 32) {
  throw new Error("Set API_URL and API_PROXY_SECRET (32+ characters) in ignored .env.cloudflare first.");
}
const parsed = new URL(apiUrl);
if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
  throw new Error("API_URL must be an HTTPS origin without a path or credentials.");
}
const child = spawn(process.execPath, [
  path.join(root, "node_modules/wrangler/bin/wrangler.js"), "secret", "bulk",
  "--config", path.join(root, "apps/cloudflare/wrangler.free.jsonc")
], { cwd: root, stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
child.stdin.on("error", () => {});
child.stdin.end(JSON.stringify({ API_URL: parsed.origin, API_PROXY_SECRET: secret }));
child.on("error", () => { console.error("Could not start Wrangler."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
