import type { NextConfig } from "next";
import { BASE_PATH } from "./lib/base-path";

const nextConfig: NextConfig = {
  output: "standalone",
  // bsvblockchain.org/faucet proxies here by path, so the app lives under /faucet (lib/base-path.ts).
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
  // The API stays at its root address too, rewritten rather than redirected: external clients,
  // the relay's callback and health probes POST and GET /api/* and need not follow a redirect.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BASE_PATH}/api/:path*`, basePath: false }];
  },
};

export default nextConfig;
