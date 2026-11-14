import { spawnSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this checker with npm run verify.");
for (const name of [
  "db:validate",
  "lint",
  "typecheck",
  "build",
  "test",
  "check:docs",
]) {
  const result = spawnSync(process.execPath, [npmCli, "run", name], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  "Foundation checks passed. Start npm run dev, then npm run test:e2e for browser verification.",
);
