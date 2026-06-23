import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@bsv/wallet-toolbox",
    "@bsv/sdk",
    "knex",
    "better-sqlite3",
  ],
};

export default nextConfig;
