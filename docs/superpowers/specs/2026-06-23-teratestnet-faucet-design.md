# Teratestnet Faucet — Design

**Date:** 2026-06-23
**Status:** Approved design, pending implementation plan
**Target network:** teratestnet (Teranode scaling test network)

## 1. Purpose

A modern, user-friendly faucet for the **teratestnet** BSV network with two ways to get coins:

1. **BRC-100 wallet onboarding** — a user connects their BRC-100 wallet in the browser and receives spendable testnet coins directly into it.
2. **Simple developer API** — a caller supplies a teratestnet address and the faucet builds, signs, **broadcasts**, and returns an **extended-format (EF)** transaction. Funds are live on-chain immediately.

Both paths run through one funding engine. Broadcasting goes through **arcade**; merkle proofs/headers come from **merkle-service**.

## 2. Key decisions

| Decision | Choice |
|---|---|
| Simple API contract | Address in → faucet **broadcasts** → returns EF tx. Funds live immediately. |
| Build approach | Fresh, lean **Next.js (App Router) + TypeScript** app; one app serves UI + API. Reuse bsv-faucet patterns, drop Clerk/Postgres weight. |
| Access / abuse model | **Light**: per-IP + per-identity rate limit, per-request amount cap, captcha on the UI (**default Cloudflare Turnstile**, behind a pluggable provider interface). Optional API key for higher limits / captcha bypass. |
| Infrastructure | **Out of scope.** arcade `/tx` URL and a funded treasury WIF are **injected as config**. We do not host arcade or a node. |
| Funding engine | **`@bsv/wallet-toolbox`** server wallet owns coin selection, UTXO locking, change, reorg handling, and BEEF assembly. Driven via `createAction`. |

## 3. Architecture

One Next.js app embeds a `@bsv/wallet-toolbox` server wallet initialized from the treasury key, configured so its **broadcaster targets the injected arcade `/tx` URL** (arcade is ARC-compatible) and its **proof/header source is merkle-service** (teratestnet). Every payout — wallet path and dev API — is a single `createAction` call; only the output script and the returned artifact (BEEF vs EF) differ.

```
                        ┌──────────────────────── Next.js app ────────────────────────┐
   Browser (UI)         │                                                              │
   ┌──────────────┐     │   /api/claim/wallet   ┌───────────────────────────────┐     │
   │ BRC-100 wallet│◄───┼──►(BRC-29 + BEEF)────► │  Faucet service layer         │     │
   │ via WalletClient    │                       │  • captcha + rate-limit guard │     │
   └──────────────┘     │   /api/claim (dev API) │  • BRC-29 script derivation   │     │
                        │   (address → EF)──────► │  • idempotency / claim log    │     │
   Dev / script ────────┼──►                     └──────────────┬────────────────┘     │
   (HTTP + API key)     │                                       │ createAction         │
                        │                          ┌────────────▼───────────────┐      │
                        │                          │ @bsv/wallet-toolbox wallet  │      │
                        │                          │ (treasury key, UTXOs, BEEF) │      │
                        │                          └─────┬──────────────┬────────┘      │
                        └────────────────────────────────┼──────────────┼───────────────┘
                                                          │ broadcast    │ proofs/headers
                                                   POST /tx│ (EF/raw)     │
                                                   ┌───────▼──────┐  ┌────▼─────────────┐
                                                   │   arcade     │  │  merkle-service  │
                                                   │ (teratestnet)│◄─┤  (teratestnet)   │
                                                   └──────┬───────┘  └──────────────────┘
                                                          │ broadcast
                                                   ┌──────▼───────┐
                                                   │  Teranode /  │
                                                   │ teratestnet  │
                                                   └──────────────┘
```

### 3.1 Wallet onboarding flow (BRC-100)

1. Browser connects the user's wallet (`WalletClient('auto')`) and reads the identity key via `getPublicKey({ identityKey: true })`.
2. Browser `POST`s `{ identityKey, amount?, captchaToken }` to `/api/claim/wallet`.
3. Faucet generates `derivationPrefix`/`derivationSuffix`, derives the recipient's **BRC-29** P2PKH locking script (type-42 from the faucet's sender key + the user's identity key, invoice number `2-3241645161d8-<prefix> <suffix>`).
4. Faucet calls `createAction` with that output → toolbox builds/signs and broadcasts via arcade → returns **Atomic BEEF** for the new tx.
5. Faucet responds `{ txid, atomicBEEF, derivationPrefix, derivationSuffix, senderIdentityKey, outputIndex, amount }`.
6. Browser calls `wallet.internalizeAction({ tx: beefBytes, outputs: [{ outputIndex, protocol: 'wallet payment', paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey } }], description })`.
7. Coins appear as **spendable balance** in the user's wallet.

The returned BEEF carries proofs of the **funded ancestors**, so the user's wallet can verify and accept the payment **without waiting for the payout itself to be mined**.

### 3.2 Dev API flow (keyless)

1. `POST /api/claim` with `{ address, amount? }` (+ captcha or API key).
2. Faucet calls `createAction` with a P2PKH output to `address` → toolbox builds/signs/broadcasts via arcade.
3. Faucet responds `{ txid, ef, outputs, network }` where `ef = tx.toHexEF()`. Funds are live immediately.

### 3.3 Integration points to confirm during implementation (teratestnet-specific)

These are config-level, not architectural:

1. Wiring the toolbox's broadcaster to arcade's ARC-compatible endpoint (`POST /tx` accepts `tx.toHexEF()`).
2. The toolbox's **chaintracker / block-header source for teratestnet** (no WhatsOnChain on teratestnet) — likely fed from merkle-service.

## 4. Components

`@bsv/wallet-toolbox` owns all UTXO/coin/BEEF state. Our own DB holds **only** faucet-policy state (claims, rate limits, API keys) — no duplicate UTXO tracking. Each unit is independently testable.

| Unit | Purpose | Interface | Depends on |
|---|---|---|---|
| `lib/config.ts` | Validate & expose env (zod) | `Config`: treasury key, `ARCADE_URL`, `MERKLE_SERVICE_URL`, `NETWORK=teratestnet`, captcha keys, payout/limit settings | — |
| `lib/wallet.ts` | Wrap the toolbox wallet (singleton, init at boot) | `payToScript(script, sats, desc) → { txid, atomicBEEF, ef }` | `@bsv/wallet-toolbox`, `@bsv/sdk`, config |
| `lib/brc29.ts` | **Pure** BRC-29 derivation | `derivePayment(recipientIdentityKey) → { lockingScript, derivationPrefix, derivationSuffix }` | `@bsv/sdk` |
| `lib/guard.ts` | Abuse layer | `check({ ip, identity?, apiKey?, captchaToken? }) → ok \| reject` | store, captcha provider |
| `lib/faucet.ts` | Claim orchestrator | `claimToWallet(identityKey, ctx)`, `claimToAddress(address, ctx)` | wallet, brc29, guard, store |
| `lib/store.ts` | Prisma/SQLite repo | typed functions over Claim/RateEvent/ApiKey | Prisma |
| `app/api/*` | Thin route handlers (zod-validate → call faucet) | `/api/claim`, `/api/claim/wallet`, `/api/status/[txid]`, `/api/health` | faucet |
| `app/*` + components | Web UI | — | `@bsv/sdk` WalletClient, shadcn |

### 4.1 Toolbox configuration

Initialize with `network: 'teratestnet'`; broadcaster → an ARC client pointed at `ARCADE_URL`; chaintracker/proof source wired to merkle-service; storage = toolbox's own SQLite.

### 4.2 Treasury bootstrap

The toolbox uses type-42 derivation, not a flat WIF, so the provided treasury coins must be brought under toolbox management once. A one-time `pnpm bootstrap` script:

1. Reads the treasury UTXOs controlled by the flat WIF.
2. Builds a sweep tx (raw `@bsv/sdk`) paying those coins into the **toolbox wallet's own deposit address**, **fanned out into `BOOTSTRAP_SPLIT_COUNT` equal outputs** (config-tunable) so the toolbox has many parallel-spendable UTXOs.
3. Broadcasts via arcade.
4. The toolbox tracks/internalizes the resulting outputs.

After bootstrap, the toolbox owns and manages everything; the flat WIF is unused at runtime. The exact deposit/import call will be confirmed against the toolbox API during implementation; the sweep-into-wallet pattern is the plan.

## 5. API contracts

### `POST /api/claim` — dev API (keyless funding)

```
Request:  { address: "n…", amount?: <sats>, captchaToken?: string }
Headers:  Authorization: Bearer <api-key>   (optional → higher limits, skips captcha)
          Idempotency-Key: <uuid>           (optional → replays prior result)
Response: { txid, ef: "<extended-format hex>",
            outputs: [{ vout, satoshis, address }], network: "teratestnet" }
```

### `POST /api/claim/wallet` — BRC-100 onboarding

```
Request:  { identityKey: "02…", amount?: <sats>, captchaToken: string }
Response: { txid, atomicBEEF: "<hex>", derivationPrefix, derivationSuffix,
            senderIdentityKey: "02…", outputIndex, amount }
```

Client completes the handoff (BEEF hex → bytes via `Utils.toArray(hex, 'hex')`):

```ts
await wallet.internalizeAction({
  tx: beefBytes,
  outputs: [{ outputIndex, protocol: 'wallet payment',
    paymentRemittance: { derivationPrefix, derivationSuffix, senderIdentityKey } }],
  description: 'Teratestnet faucet payout'
})
```

### `GET /api/status/[txid]`

Thin proxy to arcade `GET /tx/{txid}` → `{ txid, status, blockHeight? }`. Status lifecycle: `RECEIVED → SENT_TO_NETWORK → ACCEPTED_BY_NETWORK → SEEN_ON_NETWORK → MINED`.

### `GET /api/health`

`{ ok, network, arcadeReachable, merkleServiceReachable, treasuryBalance? }`.

### Amounts & errors

Single config default (`FAUCET_PAYOUT_SATS`), optional caller override capped at `FAUCET_MAX_SATS`. Consistent JSON errors `{ error, code }`:

- `400` invalid address/amount/input
- `401` bad API key
- `403` captcha failure
- `429` rate-limited (+ `Retry-After`)
- `503` faucet drained / broadcast rejected (with arcade detail)

## 6. Web UI

Single page (shadcn/Tailwind, teratestnet badge):

- **"Send to my wallet"** card — `Connect wallet` (`WalletClient('auto')`) → shows identity key → captcha → `Claim` → calls `internalizeAction` → "Funds in your wallet" toast.
- **"Send to an address"** card — address + optional amount + captcha → `Claim` → shows `txid`, copyable **EF hex**, status link.
- **Recent claims** (anonymized).
- **Developer** panel with a copy-paste `curl`/`fetch` example for `/api/claim`.

## 7. Data model (Prisma / SQLite — faucet policy only)

- **`Claim`** — `id, createdAt, path('wallet'|'address'), recipient, amountSats, txid, status, ipHash, apiKeyId?, idempotencyKey?(unique), artifact?(EF/BEEF for replay)`
- **`RateEvent`** — `subject(ipHash|identityKey|apiKeyId), kind, createdAt` → windowed COUNT for sliding-window limits
- **`ApiKey`** — `id, hashedKey, label, tier, enabled`

The toolbox keeps its UTXO/action DB separately.

## 8. Error handling, concurrency & security

- Payouts use the toolbox's **atomic `createAction`** (build + sign + broadcast). On arcade rejection (`REJECTED`/double-spend) or unreachable arcade, **abort the action** so inputs aren't left locked; return `503` with arcade detail. No dangling reservations.
- Toolbox `insufficient funds` → `503 "faucet drained"` + logged alert. (Auto-refill out of scope for v1.)
- Captcha verified **server-side**.
- Concurrency (no double-spend across concurrent requests) is handled by the toolbox's UTXO locking — we do not hand-roll it.
- **Security:** treasury key only in server env/secrets (never shipped to client); API keys hashed at rest; IPs hashed in the store; CORS open on the dev API (cross-origin dev callers) but gated by rate-limit/captcha/key.

## 9. Testing (TDD — tests first)

- **Unit:** `brc29.derivePayment` against known type-42 vectors (pure, deterministic); config validation; guard (rate window + idempotency).
- **Integration:** faucet orchestrator with a mocked toolbox + a fake broadcaster that captures submitted hex → assert it is valid EF paying the right script/amount, and that a `Claim` is recorded.
- **E2E (manual / CI-optional):** against real teratestnet arcade — address claim verified via arcade status; wallet claim verified by a connected wallet crediting spendable balance after `internalizeAction`.

## 10. Out of scope (YAGNI for v1)

Admin dashboard; multi-network switcher; deposit-monitor cron (the toolbox tracks balance); full BRC-31 / Authrite auth; waiting-for-mining SPV (we rely on ancestor-proof BEEF so payouts are usable immediately); auto-refill of the treasury.

## 11. References

- BRC-100 wallet interface — https://bsv.brc.dev/wallet/0100
- BRC-29 simple authenticated P2PKH payments — https://bsv.brc.dev/payments/0029
- BRC-62 BEEF / BRC-95 Atomic BEEF / BRC-74 BUMP — https://bsv.brc.dev/transactions/0062
- arcade (ARC-compatible broadcaster for Teranode) — https://github.com/bsv-blockchain/arcade
- merkle-service (teratestnet: `https://merkle-service-ttn-us-1.bsvb.tech`) — https://github.com/bsv-blockchain/merkle-service
- teranode — https://github.com/bsv-blockchain/teranode
- `@bsv/sdk` and `@bsv/wallet-toolbox` — https://github.com/bsv-blockchain/ts-stack
- Prior art: bsv-faucet — https://github.com/bsv-blockchain-demos/bsv-faucet

## 12. Implementation addendum (post-research, 2026-06-23)

Source-level research refined two things in this spec; the design above is otherwise unchanged.

**Delivery is decomposed into two plans.** The dev-API path is robust and independently shippable; the BRC-100 wallet-onboarding path depends on a teratestnet-capable consumer wallet (so it can SPV-verify our BEEF on `internalizeAction`), which is not yet confirmed.
- **Plan 1 — dev-API faucet** (`docs/superpowers/plans/2026-06-23-teratestnet-faucet-dev-api.md`): address-in → broadcast → EF, plus the web UI and abuse prevention, on the wallet-toolbox engine. Ship first.
- **Plan 2 — BRC-100 wallet onboarding** (`/api/claim/wallet`, BEEF + remittance, client `internalizeAction`): deferred until a teratestnet-capable wallet and the user-side SPV path are validated.

**The teratestnet headers/proof dependency is satisfied by arcade.** arcade exposes a chaintracks headers service (`:8083/chaintracks/v2`) and delivers the merkle proof as a `merklePath` field on `GET /tx/{txid}` once `MINED`. Resolved facts that shape the build: arcade broadcasts at `POST /tx` (not the ARC `/v1/tx`), so we wire a custom broadcaster into the toolbox; the toolbox's default proof providers (WhatsOnChain/Bitails) don't apply on teratestnet, so we register an arcade proof provider + a chaintracks adapter; pure-change `createAction` payouts don't need live headers/proofs, so runtime dev-API payouts stay robust; headers + proofs are exercised only by the treasury bootstrap's `internalizeAction`. Package: `@bsv/wallet-toolbox@1.8.2` (no 1.8.3 tag) + the `@bsv/sdk` it pins. teratestnet is modeled as toolbox `chain: 'test'`.
