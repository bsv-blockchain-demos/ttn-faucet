# Teratestnet Faucet

A faucet for the BSV **teratestnet** network with two ways to claim:

- **Dev API** — `POST` a teratestnet address and the service builds, signs, and **broadcasts**
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

Built on a [`@bsv/wallet-toolbox`](https://github.com/bsv-blockchain/wallet-toolbox)
server wallet, seeded once from a flat treasury key.

[Hosted faucet](https://faucet-ttn.bsvblockchain.tech/).

**Current claim controls:** captcha verification is commented out in `lib/guard.ts`, and rate limiting defaults to disabled. Set `RATE_LIMIT_DISABLED=false` to enable per-subject limits. Turnstile keys alone do not enable captcha verification. Valid API keys receive tier-based limits when rate limiting is enabled.

> See `docs/superpowers/specs/2026-06-23-teratestnet-faucet-design.md` for the full design.

## Stack

Next.js 16 (App Router) · TypeScript · `@bsv/sdk` 1.10.4 · `@bsv/wallet-toolbox` 1.8.2 ·
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
| `TREASURY_WIF` | Flat key holding teratestnet coins — used **only** by the one-time bootstrap. |
| `WALLET_ROOT_KEY_HEX` | 32-byte hex root key for the toolbox server-wallet identity. Generate once, keep secret. |
| `ARCADE_URL` | arcade broadcast + status base URL (serves `POST /tx`, `GET /tx/{txid}`). |
| `ARCADE_CHAINTRACKS_URL` | arcade chaintracks v2 base URL (headers), e.g. `…:8083/chaintracks/v2`. |
| `WALLET_STORAGE_PATH` | Toolbox wallet SQLite file (e.g. `./data/wallet.sqlite`). |
| `DATABASE_URL` | Prisma policy DB, e.g. `file:./prisma/dev.db`. |
| `TURNSTILE_SECRET_KEY` / `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare Turnstile keys. |
| `FAUCET_PAYOUT_SATS` / `FAUCET_MAX_SATS` | Default payout and per-request cap (satoshis). |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Max claims per window per subject. |
| `RATE_LIMIT_DISABLED` | Set to the literal `false` to enable rate limiting. Unset or any other value disables it. |
| `BOOTSTRAP_SPLIT_COUNT` | How many parallel-spendable UTXOs the bootstrap splits the treasury into. |
| `RELAY_INTERNAL_URL` | Optional. Base URL of the mobile-wallet relay service, e.g. `http://faucet-relay:8787`. Unset disables mobile pairing. |

## Treasury bootstrap (one-time)

The toolbox uses type-42 derivation, so the treasury coins must be brought under wallet
management once. Provide the treasury's unspent outputs in `treasury-utxos.json`
(gitignored — it contains raw tx hex):

```json
[{ "txid": "…", "vout": 0, "satoshis": 100000, "sourceRawTxHex": "…" }]
```

Then:

```bash
pnpm bootstrap      # sweeps the WIF UTXOs into BRC-29 outputs, broadcasts via arcade,
                    # waits for the merkle proof, and internalizes them into the wallet
```

The script polls arcade until the sweep is `MINED` and a `merklePath` is available, so it
needs a reachable arcade pointed at teratestnet. After it completes, the wallet tracks the
funds as spendable change and the API can pay out.

## Run

```bash
pnpm dev            # http://localhost:3000
pnpm build && pnpm start
```

## API

### `POST /api/claim`
```
Body:    { "address": "n…", "amount"?: <sats>, "captchaToken"?: "…" }
Headers: Authorization: Bearer <api-key>   (optional; tier-based limits when enabled)
         Idempotency-Key: <uuid>           (optional → replays the prior result)
200:     { "txid", "ef", "outputs": [{ "vout", "satoshis", "address" }], "network": "teratestnet" }
Errors:  400 bad input · 401 bad key · 429 rate-limited when enabled (+Retry-After) · 503 faucet error
```
```bash
curl -X POST http://localhost:3000/api/claim \
  -H 'content-type: application/json' \
  -d '{"address":"<your-teratestnet-address>","captchaToken":"<turnstile-token>"}'
```

### `POST /api/claim/wallet`
BRC-100 onboarding. The browser supplies its wallet identity key; the faucet returns Atomic BEEF +
the remittance the wallet needs to `internalizeAction`.
```
Body:    { "identityKey": "02…", "amount"?: <sats>, "captchaToken"?: "…" }
Headers: Authorization: Bearer <api-key>   (optional; tier-based limits when enabled)
200:     { "txid", "atomicBEEF": "<hex>", "derivationPrefix", "derivationSuffix",
           "senderIdentityKey": "02…", "outputIndex", "amount", "network": "teratestnet" }
Errors:  400 bad input · 401 bad key · 429 rate-limited when enabled (+Retry-After) · 503 faucet error
```
The client completes the handoff (BEEF hex → bytes via `Utils.toArray(hex, 'hex')`):
```ts
await wallet.internalizeAction({
  tx: beefBytes,
  description: 'Teratestnet faucet payout',
  outputs: [{ outputIndex, protocol: 'wallet payment',
    paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey } }],
})
```

### `GET /api/status/[txid]`
Proxies arcade → `{ txid, status, blockHeight }` (404 if unknown).

### `GET /api/health`
`{ ok, network, arcadeReachable, chaintracksReachable }` (200 healthy / 503 degraded).

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
phone   ─ GET {FAUCET_PUBLIC_URL}/api/session/:id ───────────▶ faucet ─▶ relay        (relay discovery)
phone   ─ wss://{RELAY_WS_URL}/ws ─────────────────────────────────────▶ relay        (public)
relay   ─ POST {FAUCET_INTERNAL_URL}/api/claim/mobile/:id ─▶ faucet                   (phone connected)
```

| Endpoint (faucet) | Purpose |
|---|---|
| `POST /api/claim/mobile` | Start a claim → `{ sessionId, qrDataUrl, pairingUri }` |
| `GET /api/claim/mobile/:id` | Outcome: `{ state: waiting \| claiming \| done \| error \| expired, txid?, amount?, redelivered?, code?, error? }` |
| `POST /api/claim/mobile/:id` | Relay's connect notification. It only prompts a check; the claim runs only if the relay reports the session connected |
| `GET /api/session/:id` | Proxied to the relay: how the phone finds the relay socket after scanning |

The faucet notices a connect through the relay's notification (immediate) and also checks waiting
claims every 1.5s, so a lost notification costs at most a second or two. With `RELAY_INTERNAL_URL`
unset, `POST /api/claim/mobile` returns 503 `relay_disabled` and the UI falls back to "No BRC-100
wallet detected".

The guard (captcha/rate limit) runs when the phone connects, not when the QR is shown, so viewing
the page doesn't use up a claim. A rate-limited user learns this after approving in the wallet; the
error says no coins were sent.

**Relay environment** (`relay/.env.example`):

| Var | Purpose |
|---|---|
| `RELAY_PRIVATE_KEY` | 32-byte hex relay identity key. **Keep it stable**: its public key is in every QR and is the phone's ECDH counterparty. Use a dedicated key, not the treasury. |
| `FAUCET_PUBLIC_URL` | Public `https://` origin of the faucet (QR pairing origin). Must be the exact canonical origin users load: the phone fetches `/api/session/:id` from it with redirects disallowed, so an edge redirect (www, trailing slash) breaks pairing. |
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
cd relay && pnpm install --ignore-workspace
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
4. Enable rate limiting and check for HTTP 429 over the limit, invalid API key rejection, and idempotent replay. Captcha rejection requires restoring the verification code first.
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
- Background proof completion (the toolbox `Monitor`) is not enabled; pure-change payouts
  use already proven funding ancestors, but long-running deployments need a separate proof-completion strategy.

## Licence

**Open BSV Licence v6.** See [LICENSE.txt](LICENSE.txt) for the full terms. The licence applies to this project's original code and documentation and restricts use to the BSV blockchain defined in the licence. Third-party code, assets and referenced standards retain their respective terms.
