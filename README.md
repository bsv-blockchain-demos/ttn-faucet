# BSV Faucet

A faucet for the BSV test networks — **Testnet**, **Teratestnet** (`ttn`) and **Teranode STN**
(`tstn`) — with two ways to claim. Each network runs its own server wallet; a deployment pays out
on whichever networks it configures (see [Networks](#networks)).

- **Dev API** — `POST` a testnet address and a `network` and the service builds, signs, and **broadcasts**
  a funding transaction through [arcade](https://github.com/bsv-blockchain/arcade), then returns
  the transaction in **extended format (EF)**. The returned transaction ID can be used to check its broadcast and mining status.
- **BRC-100 wallet onboarding** — load the page with a BRC-100 wallet (BSV Browser / BSV Desktop /
  Metanet Desktop) and click once: the faucet pays a BRC-29 output to your wallet's identity key
  and hands back **Atomic BEEF**, which the wallet accepts via `internalizeAction`. No key or
  address to type, with the funded ancestors' proofs included in the BEEF. The recipient wallet must accept the transaction before it can use the funds.
  **No browser wallet?** The page offers a claim with the
  [BSV Wallet](https://github.com/bsv-blockchain/bsv-wallet) mobile app instead: scan the QR (or tap
  the button on the phone itself) and approve, and the coins arrive in the wallet over
  [`@bsv/wallet-relay`](https://www.npmjs.com/package/@bsv/wallet-relay) (see
  [Mobile wallet pairing](#mobile-wallet-pairing)).

**Picking the network.** BRC-100 `getNetwork` only reports `mainnet` or `testnet` — every test
network answers `testnet` — so a wallet can't tell the faucet which one it is on. The page has a
network picker instead (default Testnet, remembered in `localStorage`), restates the network on the
claim button, and uses `getNetwork` to detect the wallet at all (no answer → BSV Desktop / BSV
Browser download links) and to block claims from a mainnet wallet.

Built on a [`@bsv/wallet-toolbox`](https://github.com/bsv-blockchain/wallet-toolbox)
server wallet, seeded once from a flat treasury key.

[Hosted faucet](https://bsvblockchain.com/faucet), proxied by path to this app at faucet.bsvblockchain.tech/faucet (also served at faucet-ttn.bsvblockchain.tech). The app is mounted under `/faucet` (`lib/base-path.ts`); the old root addresses redirect, and `/api/*` still answers at the root.

**Current claim controls:** Turnstile and rate limiting are both off by default. Set `TURNSTILE_REQUIRED=true` (with both Turnstile keys) to require a captcha on public claims, and `RATE_LIMIT_DISABLED=false` to enable per-subject limits. Turnstile keys alone do not enable captcha verification. Valid API keys skip the captcha and receive tier-based limits when rate limiting is enabled.

> See `docs/superpowers/specs/2026-06-23-teratestnet-faucet-design.md` for the full design.

## Stack

Next.js 16 (App Router) · TypeScript · `@bsv/sdk` 3.2.1 · `@bsv/wallet-toolbox` 2.14.9 ·
`knex` + `sqlite3` (toolbox storage) · Prisma 7 + SQLite (policy DB) · Zod · Tailwind ·
Vitest · pnpm. Use Node.js 22.12+ and pnpm 10.31.0, matching the package requirements and Docker toolchain.

## Setup

```bash
git clone https://github.com/bsv-blockchain-demos/ttn-faucet.git
cd ttn-faucet
pnpm install --frozen-lockfile
cp .env.example .env            # then fill in the values (see below)
mkdir -p data
DATABASE_URL="file:$PWD/data/policy.sqlite" pnpm prisma migrate deploy
DATABASE_URL="file:$PWD/data/policy.sqlite" pnpm prisma generate
```

Set the same absolute `DATABASE_URL` in `.env` for the running app. The Prisma CLI configuration does not load `.env` itself, so pass this variable when running Prisma commands. An absolute path also avoids a mismatch between the CLI's and SQLite adapter's relative paths.

### Environment (`.env`)

| Var | Purpose |
|---|---|
| `WALLET_ROOT_KEY_HEX` | 32-byte hex root key for the toolbox server-wallet identity, shared by every network unless `{PREFIX}_WALLET_ROOT_KEY_HEX` overrides it. Generate once, keep secret. |
| `{PREFIX}_ARCADE_URL` | arcade broadcast + status base URL for a network (serves `POST /tx`, `GET /tx/{txid}`). **Setting it enables the network.** |
| `{PREFIX}_ARCADE_CHAINTRACKS_URL` | That network's arcade chaintracks v2 base URL (headers), e.g. `…/chaintracks/v2`. |
| `{PREFIX}_WALLET_STORAGE_PATH` | That network's toolbox wallet SQLite file (e.g. `./data/wallet-testnet.sqlite`). One file per network. |
| `{PREFIX}_TREASURY_WIF` | Flat key holding that network's coins — used **only** by the bootstrap scripts. |
| `DATABASE_URL` | Prisma policy DB, e.g. `file:./prisma/dev.db`. |
| `TURNSTILE_REQUIRED` | Set to the literal `true` to require a Turnstile token on public claims ([Turnstile](#turnstile)). Unset or any other value leaves Turnstile off. |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key, used server-side to verify tokens. Required when `TURNSTILE_REQUIRED=true`. |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key, read at runtime and passed to the widget. Required (or its deprecated name below) when `TURNSTILE_REQUIRED=true`. |
| `FAUCET_PAYOUT_SATS` / `FAUCET_MAX_SATS` | Default payout and per-request cap (satoshis). |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Max claims per window per subject. |
| `RATE_LIMIT_DISABLED` | Set to the literal `false` to enable rate limiting. Unset or any other value disables it. |
| `BOOTSTRAP_SPLIT_COUNT` | How many parallel-spendable UTXOs the bootstrap splits the treasury into. |
| `FAUCET_DEFAULT_NETWORK` | Optional. `testnet` \| `ttn` \| `tstn`: where API calls without a `network` go. Must be a configured network. |
| `RELAY_INTERNAL_URL` | Optional. Base URL of the mobile-wallet relay service, e.g. `http://faucet-relay:8787`. Unset disables mobile pairing. |
| `SITE_URL` | Optional, read at runtime. Public address of the faucet, base path included, e.g. `https://example.com/faucet`; a trailing slash is ignored, and a value that is not an absolute `http(s)` URL is skipped. Used for Open Graph image URLs and the API example on the page. Default `https://bsvblockchain.com/faucet`. |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | **Deprecated** names for `SITE_URL` / `TURNSTILE_SITE_KEY`, still read from the runtime environment. The site key is also read as inlined by `next build` (the Docker `NEXT_PUBLIC_TURNSTILE_SITE_KEY` build arg). The runtime vars above take precedence. |

The page is rendered per request, so one image serves every deployment: set `SITE_URL` and
`TURNSTILE_SITE_KEY` on each deployment rather than building an image per URL or key. A `SITE_URL`
that is set but rejected is logged once (`Ignoring SITE_URL=…`) and the next source is used.

### Turnstile

With `TURNSTILE_REQUIRED=true`, a claim without an API key needs a Turnstile token that Cloudflare's
siteverify accepts for `TURNSTILE_SECRET_KEY`; anything else gets 403 `captcha`. With `TURNSTILE_REQUIRED=true` and either key
missing, the config fails to load, so every claim errors (500) and the log names the missing key.
Per claim path:

| Path | Token |
|---|---|
| `POST /api/claim`, `POST /api/claim/wallet` | `captchaToken` in the body, unless an API key is sent. |
| `POST /api/claim/mobile` | `captchaToken` in the body, checked before the pairing session opens. The claim itself runs later, when the phone connects, and is only rate-limited then. |
| `POST /api/claim/mobile/:id` (relay notification) | None: server to server, and it only prompts a check. |

Unset or any other value: no widget on the page, tokens are ignored, claims behave as before.

Test keys: with no site key set or inlined, the page falls back to Cloudflare's test site key
`1x00000000000000000000AA`, whose widget always passes and hands out a dummy token. Only
Cloudflare's test secret keys accept dummy tokens (`1x0000000000000000000000000000000AA` always
passes, `2x0000000000000000000000000000000AA` always fails); a real secret rejects them. So switch
Turnstile on with a matching real pair, and add every host the page is served from to the site
key's hostnames in the Cloudflare dashboard.

### Networks

`{PREFIX}` is `TESTNET`, `TTN` or `TSTN` (`lib/networks.ts`). A network is offered when its
`{PREFIX}_ARCADE_URL` is set; the picker greys out the rest. The page always starts on Testnet
(or the visitor's last pick). API requests without a `network` go to `FAUCET_DEFAULT_NETWORK` if
set, else Testnet when it is enabled, else the first enabled network — **pin
`FAUCET_DEFAULT_NETWORK` before adding a network to a live deployment**, or existing API clients that
send no `network` will start receiving coins on the new one. Deployments configured before
multi-network support keep working: unprefixed `ARCADE_URL`, `ARCADE_CHAINTRACKS_URL`,
`WALLET_STORAGE_PATH` and `TREASURY_WIF` configure Teratestnet when no `TTN_*` vars are set.

The Teratestnet wallet now runs as toolbox chain `ttn` (it ran as `test` before toolbox 2.x added
`ttn`). The chain recorded in an existing wallet storage file is metadata only in toolbox 2.14.9
(nothing compares it), and `ttn` also stops the toolbox wiring public-testnet WhatsOnChain/Bitails
into the Teratestnet wallet. Still, check payouts on staging against a copy of the live storage
file before deploying. Existing payout rows are migrated to `network = 'ttn'`.

## Treasury bootstrap (one-time)

The toolbox uses type-42 derivation, so the treasury coins must be brought under wallet
management once. Provide the treasury's unspent outputs in `treasury-utxos.json`
(gitignored — it contains raw tx hex):

```json
[{ "txid": "…", "vout": 0, "satoshis": 100000, "sourceRawTxHex": "…" }]
```

Then:

```bash
FAUCET_NETWORK=testnet pnpm bootstrap   # sweeps the WIF UTXOs into BRC-29 outputs, broadcasts via
                                        # arcade, waits for the merkle proof, and internalizes them
```

Run it once per network (`FAUCET_NETWORK` = `testnet` | `ttn` | `tstn`; default: the default
network). The script polls arcade until the sweep is `MINED` and a `merklePath` is available, so it
needs a reachable arcade for that network. After it completes, the wallet tracks the
funds as spendable change and the API can pay out.

## Run

```bash
pnpm dev            # http://localhost:3000
pnpm build && pnpm start
```

## API

### `POST /api/claim`
```
Body:    { "address": "n…", "network"?: "testnet" | "ttn" | "tstn", "amount"?: <sats>, "captchaToken"?: "…" }
Headers: Authorization: Bearer <api-key>   (optional; tier-based limits when enabled)
         Idempotency-Key: <uuid>           (optional → replays the prior result)
200:     { "txid", "ef", "outputs": [{ "vout", "satoshis", "address" }], "network": "<network>" }
Errors:  400 bad input / unknown network · 400 network_unavailable (not configured here) · 401 bad key
         · 403 captcha (TURNSTILE_REQUIRED, no API key) · 429 rate-limited when enabled (+Retry-After)
         · 503 faucet error
```
```bash
curl -X POST http://localhost:3000/api/claim \
  -H 'content-type: application/json' \
  -d '{"address":"<your-testnet-address>","network":"testnet"}'
```

### `POST /api/claim/wallet`
BRC-100 onboarding. The browser supplies its wallet identity key; the faucet returns Atomic BEEF +
the remittance the wallet needs to `internalizeAction`.
```
Body:    { "identityKey": "02…", "network"?: "testnet" | "ttn" | "tstn", "amount"?: <sats>, "captchaToken"?: "…" }
Headers: Authorization: Bearer <api-key>   (optional; tier-based limits when enabled)
200:     { "txid", "atomicBEEF": "<hex>", "derivationPrefix", "derivationSuffix",
           "senderIdentityKey": "02…", "outputIndex", "amount", "network": "<network>" }
Errors:  as /api/claim
```
The client completes the handoff (BEEF hex → bytes via `Utils.toArray(hex, 'hex')`):
```ts
await wallet.internalizeAction({
  tx: beefBytes,
  description: 'Testnet faucet payout',
  outputs: [{ outputIndex, protocol: 'wallet payment',
    paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey } }],
})
```

### `GET /api/networks`
`{ networks: ["testnet", "ttn"], default: "testnet" }` — the networks this deployment pays out on.

### `GET /api/status/[txid]?network=<network>`
Proxies that network's arcade → `{ txid, status, blockHeight, network }` (404 if unknown).

### `GET /api/balance?network=<network>` · `GET /api/stats[?network=<network>]`
Faucet wallet balance on a network; lifetime payout stats for one network or all.

### `GET /api/health`
`{ ok, degraded, networks: [{ network, ok, arcadeReachable, chaintracksReachable }] }`. 200 while
at least one configured network can pay out (`degraded: true` if any is down), 503 only when none
can — so one network's outage doesn't fail the readiness probe for the others.

## Mobile wallet pairing

When no BRC-100 wallet answers in the browser, the wallet tab offers a claim with the
[BSV Wallet](https://github.com/bsv-blockchain/bsv-wallet) app over
[`@bsv/wallet-relay`](https://www.npmjs.com/package/@bsv/wallet-relay) (the same pattern as
[whoiam](https://github.com/bsv-blockchain/whoiam)). On a computer you scan the QR; on the phone
itself you tap "Claim with BSV Wallet". **Approving the connection in the wallet is the claim.** The
faucet server then, while the wallet is still on screen:

1. asks the phone for its identity key (`getPublicKey`),
2. runs the usual guard and pays a BRC-29 output to that key, and
3. hands the payment to the wallet (`internalizeAction`),

which takes about two seconds. The page only shows the outcome. This server-driven order matters
on a single phone: only one app runs at a time there, so the browser is frozen while BSV Wallet is
open, and BSV Wallet's relay socket drops within seconds of the user switching back to the
browser.

If the wallet closes before accepting the payment, the payout is kept (`Claim.remittance`, with
`deliveredAt` unset) and **redelivered the next time that wallet connects** instead of paying again
(within 24h). `internalizeAction` tolerates a repeat, so a redelivery is harmless. A second payout
to the same wallet is refused while one is still in progress.

`@bsv/wallet-relay` needs `@bsv/sdk` 2.x while the faucet's wallet stack is on 1.x, so the relay runs
as a small separate service in [`relay/`](relay/) (own `package.json`/lockfile, image
`ttn-faucet-relay`). The faucet talks to it server-side; the relay's desktop token never reaches the
browser.

```
browser ─ POST /api/claim/mobile, GET /api/claim/mobile/:id ─▶ faucet ─▶ relay :8787  (RELAY_INTERNAL_URL)
phone   ─ GET {FAUCET_PUBLIC_URL}/api/session/:id ───────────▶ faucet ─▶ relay        (relay discovery, at the host root)
phone   ─ wss://{RELAY_WS_URL}/ws ─────────────────────────────────────▶ relay        (public)
relay   ─ POST {FAUCET_INTERNAL_URL}/api/claim/mobile/:id ─▶ faucet                   (phone connected)
```

| Endpoint (faucet) | Purpose |
|---|---|
| `POST /api/claim/mobile` | Start a claim (body `{ network?, captchaToken? }`) → `{ sessionId, qrDataUrl, pairingUri }`; 403 `captcha` when Turnstile is required and the token fails |
| `GET /api/claim/mobile/:id` | Outcome: `{ state: waiting \| claiming \| done \| error \| expired, txid?, amount?, redelivered?, code?, error? }` |
| `POST /api/claim/mobile/:id` | Relay's connect notification. It only prompts a check; the claim runs only if the relay reports the session connected |
| `GET /api/session/:id` | Proxied to the relay: how the phone finds the relay socket after scanning |

**Size limit.** A relay message carries at most 48 KiB of plaintext, which fits an Atomic BEEF of
about 13 KB. With merkle proofs completed (see Known limitations) a payout's BEEF is usually under
a few KB; a long run of payouts between blocks can exceed the limit, in which case the claim fails
with a "too large for now" message, the payout is kept, and a retry after the next block delivers a
rebuilt (smaller) BEEF.

The faucet notices a connect through the relay's notification (immediate) and also checks waiting
claims every 1.5s, so a lost notification costs at most a second or two. With `RELAY_INTERNAL_URL`
unset, `POST /api/claim/mobile` returns 503 `relay_disabled` and the UI falls back to "No BRC-100
wallet detected".

The rate limit runs when the phone connects, not when the QR is shown, so viewing the page doesn't
use up a claim. The captcha, when required, is the exception: it is checked when the claim starts,
because no browser token is at hand when the phone connects. A rate-limited user learns this after approving in the wallet; the
error says no coins were sent.

**Relay environment** (`relay/.env.example`):

| Var | Purpose |
|---|---|
| `RELAY_PRIVATE_KEY` | 32-byte hex relay identity key. **Keep it stable**: its public key is in every QR and is the phone's ECDH counterparty. Use a dedicated key, not the treasury. |
| `FAUCET_PUBLIC_URL` | Public `https://` origin of the faucet (QR pairing origin), with **no path**, e.g. `https://example.com` even when the faucet is served at `https://example.com/faucet`. The phone fetches `/api/session/:id` at the **root** of this host, with redirects disallowed. A site that serves the faucet under a path must forward that root path to the faucet unchanged (the faucet answers root `/api/*` as well as `/faucet/api/*`), not redirect it. Any edge redirect on that URL (www, trailing slash, host move) breaks pairing. |
| `RELAY_WS_URL` | Public `wss://` origin of the relay socket, with no path (the phone appends `/ws`). |
| `FAUCET_INTERNAL_URL` | In-cluster faucet base URL (e.g. `http://faucet:3000`). The relay notifies `POST /api/claim/mobile/:id` there the moment a phone connects. Optional: without it the faucet's 1.5s check still finds the connect. |
| `QR_SCHEMA` | Deep-link scheme, default `bsv-wallet`. |
| `PORT` | Default `8787`. |

**Deploying:** run the relay as a **single replica** (sessions live in memory). Route a public `wss://`
host to it with WebSocket upgrades and long read timeouts, and point the faucet's
`RELAY_INTERNAL_URL` at its in-cluster Service. bsv-wallet only accepts an HTTPS pairing origin and a
`wss://` relay on a public (non-loopback, non-private) host.

**Local development:** the phone has to reach both services over public TLS, so tunnel them, e.g.
with ngrok (`ngrok http 3000` and `ngrok http 8787`):

```bash
cd relay && pnpm install
RELAY_PRIVATE_KEY=<hex> FAUCET_PUBLIC_URL=https://<faucet-tunnel> \
  RELAY_WS_URL=wss://<relay-tunnel> FAUCET_INTERNAL_URL=http://localhost:3000 \
  pnpm dev                                              # or put these in relay/.env
RELAY_INTERNAL_URL=http://localhost:8787 pnpm dev       # faucet, from the repo root
```

Open the faucet through its tunnel URL so the QR's origin matches. Relay tests: `cd relay && pnpm test`.

## Tests

The database-backed tests write fixture records. Use a separate test database:

```bash
DATABASE_URL="file:$PWD/data/tests.sqlite" pnpm prisma migrate deploy
DATABASE_URL="file:$PWD/data/tests.sqlite" pnpm test
pnpm exec tsc --noEmit                           # type-check
pnpm build                                        # production build
```

## Live verification

The unit suite mocks arcade. Before a real deploy, verify against the live arcade +
funded treasury:

1. Confirm arcade's actual routes/field names: `POST /tx` body/response, `GET /tx/{txid}`
   (`txStatus`/`merklePath`/`blockHeight` casing), and chaintracks `/height` +
   `/header/height/{h}` (`merkleRoot`). Adjust `lib/arcade.ts` / `lib/arcade-chaintracks.ts`
   if names differ.
2. Run `pnpm bootstrap` with a funded `TREASURY_WIF` + `treasury-utxos.json`.
3. `curl` a claim end-to-end; confirm the returned `ef` parses and the status advances to `MINED`.
4. Enable rate limiting and check for HTTP 429 over the limit, invalid API key rejection, and idempotent replay. With `TURNSTILE_REQUIRED=true`, check that a claim without a token gets HTTP 403 `captcha`.
5. If arcade has no `/health` route, point the health probe at `${ARCADE_URL}/` instead.

## Known limitations

- A claim that **fails** while carrying an `Idempotency-Key` keeps the key, so retrying with
  the same key returns 503 (unique-constraint) instead of cleanly retrying. Check the wallet and broadcast state before attempting another payout: a failure after broadcasting can leave the database without the transaction result.
- The generated Prisma client is committed (Prisma 7 + driver-adapter, custom output dir).
- A mobile claim creates a relay session whenever the wallet tab opens without a local wallet.
  Each QR is valid for 2 minutes, and the relay caps creation at 120 sessions/minute overall. Past
  that cap, visitors see the plain "No BRC-100 wallet detected" panel until it clears.
- Mobile claims in progress live in the faucet process's memory (as relay sessions do in the relay),
  so a faucet restart drops them; the page then starts a fresh claim. Undelivered payouts are in
  the database and survive restarts.
- Merkle proofs are completed by a small job in the faucet process (`lib/proofs.ts`), every
  minute, from arcade. It doesn't count as a proof attempt, so a transaction arcade can't find is
  never given up on. Without proofs, payout BEEFs carried every earlier payout as an unconfirmed
  ancestor (125 KB, 530 transactions); with them a payout's BEEF is its parents since the last
  block plus one merkle path each. Proofs are taken 3 blocks below the tip, and each pass also
  re-proves recent proofs whose block a re-org replaced (teratestnet does re-org; a stale proof
  makes every payout spending from it fail with "merged Beef failed validation"). A payout that
  hits a stale proof triggers that repair immediately and retries once.

## Licence

**Open BSV Licence v6.** See [LICENSE.txt](LICENSE.txt) for the full terms. The licence applies to this project's original code and documentation and restricts use to the BSV blockchain defined in the licence. Third-party code, assets and referenced standards retain their respective terms.
