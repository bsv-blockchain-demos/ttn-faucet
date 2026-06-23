# Teratestnet Faucet — Dev API (Plan 1)

A developer-facing faucet for the BSV **teratestnet** network. `POST` a teratestnet
address and the service builds, signs, and **broadcasts** a funding transaction through
[arcade](https://github.com/bsv-blockchain/arcade), then returns the transaction in
**extended format (EF)**. Funds are live on-chain immediately.

Built on a [`@bsv/wallet-toolbox`](https://github.com/bsv-blockchain/wallet-toolbox)
server wallet (seeded once from a flat treasury key) with light abuse prevention
(per-subject rate limiting + Cloudflare Turnstile, or an API key for higher limits).

> **Scope.** This is **Plan 1**: the dev API + web UI. BRC-100 wallet onboarding
> (`/api/claim/wallet`) is **deferred to Plan 2** — see
> `docs/superpowers/specs/2026-06-23-teratestnet-faucet-design.md`.

## Stack

Next.js 16 (App Router) · TypeScript · `@bsv/sdk` 1.10.4 · `@bsv/wallet-toolbox` 1.8.2 ·
`knex` + `sqlite3` (toolbox storage) · Prisma 7 + SQLite (policy DB) · Zod · Tailwind ·
Vitest · pnpm. (Requires Node ≥ 20; developed on Node 25.)

## Setup

```bash
pnpm install
cp .env.example .env            # then fill in the values (see below)
DATABASE_URL="file:./prisma/dev.db" pnpm prisma migrate dev   # create the policy DB
```

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
| `BOOTSTRAP_SPLIT_COUNT` | How many parallel-spendable UTXOs the bootstrap splits the treasury into. |

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
Headers: Authorization: Bearer <api-key>   (optional → higher limits, skips captcha)
         Idempotency-Key: <uuid>           (optional → replays the prior result)
200:     { "txid", "ef", "outputs": [{ "vout", "satoshis", "address" }], "network": "teratestnet" }
Errors:  400 bad input · 401 bad key · 403 captcha · 429 rate-limited (+Retry-After) · 503 faucet error
```
```bash
curl -X POST http://localhost:3000/api/claim \
  -H 'content-type: application/json' \
  -d '{"address":"<your-teratestnet-address>","captchaToken":"<turnstile-token>"}'
```

### `GET /api/status/[txid]`
Proxies arcade → `{ txid, status, blockHeight }` (404 if unknown).

### `GET /api/health`
`{ ok, network, arcadeReachable, chaintracksReachable }` (200 healthy / 503 degraded).

## Tests

```bash
DATABASE_URL="file:./prisma/dev.db" pnpm test    # 40 unit/integration tests
pnpm exec tsc --noEmit                           # type-check
pnpm build                                        # production build
```

## Live verification (Task 18 — run against real infra)

The unit suite mocks arcade. Before a real deploy, verify against the live arcade +
funded treasury (see the plan's Task 18 for the full checklist):

1. Confirm arcade's actual routes/field names: `POST /tx` body/response, `GET /tx/{txid}`
   (`txStatus`/`merklePath`/`blockHeight` casing), and chaintracks `/height` +
   `/header/height/{h}` (`merkleRoot`). Adjust `lib/arcade.ts` / `lib/arcade-chaintracks.ts`
   if names differ.
2. Run `pnpm bootstrap` with a funded `TREASURY_WIF` + `treasury-utxos.json`.
3. `curl` a claim end-to-end; confirm the returned `ef` parses and the status advances to `MINED`.
4. Verify guard behaviour (403 without captcha; 429 over the limit; idempotent replay).
5. If arcade has no `/health` route, point the health probe at `${ARCADE_URL}/` instead.

## Known follow-ups (non-blocking)

- A claim that **fails** while carrying an `Idempotency-Key` keeps the key, so retrying with
  the same key returns 503 (unique-constraint) instead of cleanly retrying. Behaviour is safe
  (never double-pays); use a fresh key to retry, or add upsert handling in `lib/faucet.ts`.
- The generated Prisma client is committed (Prisma 7 + driver-adapter, custom output dir).
- Background proof completion (the toolbox `Monitor`) is not enabled; pure-change payouts
  don't need it, but long-running deployments may want it (see Plan 1 §Out of scope).
