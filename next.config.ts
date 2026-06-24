import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@bsv/wallet-toolbox",
    "@bsv/sdk",
    "knex",
    "better-sqlite3",
  ],
};

export default nextConfig;
