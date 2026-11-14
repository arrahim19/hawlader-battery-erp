import { spawn } from "node:child_process";

const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "build", "apps/web"],
  {
    env: {
      ...process.env,
      STATIC_EXPORT: "true",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    stdio: "inherit",
    windowsHide: true,
  },
);
child.on("error", () => {
  console.error("Could not start the frontend build. Run npm ci first.");
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
