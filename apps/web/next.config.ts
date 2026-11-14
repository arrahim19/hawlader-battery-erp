import type { NextConfig } from "next";
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, "../../.env"), quiet: true });
const internalApiUrl = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:3001";
const staticExport = process.env.STATIC_EXPORT === "true";
const config: NextConfig = {
  output: staticExport
    ? "export"
    : process.env.CONTAINER_BUILD === "true"
      ? "standalone"
      : undefined,
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  poweredByHeader: false,
  turbopack: { root: path.resolve(__dirname, "../..") },
  ...(staticExport
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/v1/:path*",
              destination: `${new URL(internalApiUrl).origin}/api/v1/:path*`,
            },
          ];
        },
      }),
};
export default config;
