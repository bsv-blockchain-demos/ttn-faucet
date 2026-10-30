/**
 * Where the app is mounted. bsvblockchain.com/faucet is proxied here with the path unchanged, so
 * every page, asset and API route lives under /faucet; next.config.ts sets it as Next's basePath and
 * redirects the old root pages, and proxy.ts keeps /api/* answering at the root on this host.
 */
export const BASE_PATH = '/faucet'

/** Next prefixes links and its own assets with the base path; fetch() and CSS url() it does not. */
export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`
}
