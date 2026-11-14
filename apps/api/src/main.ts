import { createApp } from "./app";
import { settings } from "./config";
async function main() {
  const app = await createApp();
  await app.listen(settings().port, settings().host);
  console.log(
    `Hawlader API: http://localhost:${settings().port}/api/v1/health`,
  );
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Startup failed");
  process.exitCode = 1;
});
