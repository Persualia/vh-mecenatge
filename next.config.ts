import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * The Meta token is shared with the rest of Persualia's tooling and is never copied
 * into this repository. It is read from, in order of precedence:
 *   1. the environment the process already has (CI, a shell export);
 *   2. `.env` at the root of this repository;
 *   3. the shared credentials repository, `VHIR_CREDENTIALS_DIR` or mcp-ads-persualia.
 * forceReload: Next has already loaded this folder's env and would return it cached.
 */
const sharedCredentials = process.env.VHIR_CREDENTIALS_DIR ?? resolve(process.cwd(), "..", "..", "mcp-ads-persualia");
for (const dir of [resolve(process.cwd(), ".."), sharedCredentials]) {
  if (!process.env.META_ACCESS_TOKEN && existsSync(resolve(dir, ".env"))) loadEnvConfig(dir, dev, console, true);
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    agentUpgrade: "security",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
