import type { NextConfig } from "next";
import path from "node:path";
import { config as loadEnv } from "dotenv";
loadEnv({ path: path.resolve(__dirname, "../../.env"), quiet: true });
const internalApiUrl = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:3001";
const config: NextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  poweredByHeader: false,
  turbopack: { root: path.resolve(__dirname, "../..") },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${new URL(internalApiUrl).origin}/api/v1/:path*`,
      },
    ];
  },
};
export default config;
