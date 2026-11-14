import { spawn } from "node:child_process";

for (const name of ["DATABASE_URL", "CSRF_SECRET", "APP_ORIGIN"]) {
  if (!process.env[name]) throw new Error(`Missing runtime setting: ${name}`);
}
if (new URL(process.env.APP_ORIGIN).protocol !== "https:") {
  throw new Error("APP_ORIGIN must use HTTPS in production.");
}

// Both servers share one container. Only Next.js is exposed; the API stays on
// loopback behind its /api/v1 rewrite, preserving same-origin secure cookies.
const children = [];
let stopping = false;
let stopTimer;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  stopTimer = setTimeout(() => {
    for (const child of children) child.kill("SIGKILL");
  }, 10_000);
  stopTimer.unref();
}
for (const entry of [
  "apps/api/dist/apps/api/src/main.js",
  "apps/web/server.js",
]) {
  const child = spawn(process.execPath, [entry], {
    stdio: "inherit",
    env: process.env,
  });
  children.push(child);
  child.once("error", () => {
    console.error("An application process could not start.");
    stop(1);
  });
  child.once("exit", (code) => {
    if (!stopping) stop(code || 1);
    if (children.every((item) => item.exitCode !== null || item.signalCode)) {
      clearTimeout(stopTimer);
    }
  });
}
process.once("SIGTERM", () => stop(0));
process.once("SIGINT", () => stop(0));
