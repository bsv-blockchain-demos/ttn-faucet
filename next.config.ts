import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/base-path";

const nextConfig: NextConfig = {
  output: "standalone",
  // bsvblockchain.com/faucet proxies here by path, so the app lives under /faucet (lib/base-path.ts).
  basePath: BASE_PATH,
  serverExternalPackages: [
    "@bsv/wallet-toolbox",
    "@bsv/sdk",
    "knex",
    "better-sqlite3",
  ],
  // The pages' old root addresses on this host send the reader to their new ones.
  async redirects() {
    return [
      { source: "/", destination: BASE_PATH, basePath: false, permanent: false },
      { source: "/states", destination: `${BASE_PATH}/states`, basePath: false, permanent: false },
    ];
  },
  // The API's root address, /api/*, is rewritten onto /faucet/api/* in proxy.ts.
};

export default nextConfig;
