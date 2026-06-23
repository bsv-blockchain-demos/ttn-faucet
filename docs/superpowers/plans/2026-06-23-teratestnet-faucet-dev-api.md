# Teratestnet Faucet — Dev API (Plan 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the developer-facing teratestnet faucet: a caller POSTs a teratestnet address, the service builds + broadcasts a funding transaction through arcade, and returns the extended-format (EF) transaction — plus a minimal web UI for the same, with light abuse prevention (per-IP rate limit + Cloudflare Turnstile).

**Architecture:** One Next.js (App Router, TS) app. The funding engine is a `@bsv/wallet-toolbox` server wallet seeded once from a flat treasury WIF (via a bootstrap sweep + `internalizeAction`). Payouts call `wallet.createAction` (pure-change, no explicit inputs), which broadcasts through a **custom arcade `POST /tx` service** wired into the toolbox; we then extract EF from the returned AtomicBEEF. arcade also supplies block headers (`:8083/chaintracks/v2`) and merkle proofs (`merklePath` on `GET /tx/{txid}`), needed only at bootstrap. This plan is **Plan 1** of two; Plan 2 (BRC-100 wallet onboarding) is deferred until a teratestnet-capable consumer wallet is confirmed.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · `@bsv/sdk` ^1.10.2 · `@bsv/wallet-toolbox` 1.8.2 · `knex` + `sqlite3` (toolbox storage) · Prisma + SQLite (faucet policy DB) · Zod · Tailwind CSS · Vitest · pnpm.

---

## Verified integration contracts (read first — these are load-bearing)

These were verified against source. Treat the **UNVERIFIED** items as things to confirm against the live arcade instance (each has a dedicated verification step in the relevant task).

**Package versions.** Use `@bsv/wallet-toolbox@1.8.2` (there is **no** 1.8.3 tag) and the `@bsv/sdk` it pins (`^1.10.2`). Pin both exactly in `package.json`.

**Network.** teratestnet is modeled as toolbox `chain: 'test'` (testnet address prefix `0x6f`). The toolbox only supports `'main' | 'test'`. Custom network behavior comes entirely from pointing broadcaster/headers/proofs at arcade.

**arcade HTTP contract** (default ports; confirm against your instance):
- Broadcast: `POST {ARCADE_URL}/tx` — accepts JSON `{"rawTx":"<hex>"}` (also `text/plain` hex). Returns **202** `{"status":"submitted"}` or `{"status":"already submitted","txid":"<hex>","state":"<STATUS>"}`. It does **NOT** serve `/v1/tx`, so the SDK's built-in `ARC` broadcaster cannot reach it — we wire our own.
- Status + proof (pull): `GET {ARCADE_URL}/tx/{txid}` → `{"txid","txStatus","blockHash?","blockHeight?","merklePath?",...}`. `merklePath` is the BUMP as hex, present only once `txStatus === "MINED"`. No separate proof endpoint; polling is the mechanism.
- Headers (chaintracks): `GET {ARCADE_CHAINTRACKS_URL}/height` → `{"height":<n>}`; `GET {ARCADE_CHAINTRACKS_URL}/header/height/{h}` and `/header/hash/{hash}` → `BlockHeader` JSON `{version, previousHash, merkleRoot, time, bits, nonce, height, hash}`. `ARCADE_CHAINTRACKS_URL` ends in `/chaintracks/v2` (default port 8083).
- Status lifecycle strings: `RECEIVED, SENT_TO_NETWORK, ACCEPTED_BY_NETWORK, SEEN_ON_NETWORK, SEEN_ON_MULTIPLE_NODES, MINED, IMMUTABLE`; failures `REJECTED, DOUBLE_SPEND_ATTEMPTED`.
- **UNVERIFIED:** exact JSON field names/casing of `GET /tx/{txid}` and the chaintracks header object on your build; the default ports (README shows `:3011`, code shows `:8080`/`:8083`). Confirm in Task 5/6/8.

**Toolbox wiring facts:**
- `Wallet` is built from `{ chain, keyDeriver, storage, services }`. The constructor enforces `storage` identity key === `keyDeriver` identity key.
- The custom broadcast service type is `PostBeefService = (beef: Beef, txids: string[]) => Promise<PostBeefResult>`. The interpreter reads `result.status` (top-level) and `result.txidResults[].{txid,status,doubleSpend?,serviceError?,alreadyKnown?}`. `name` is required. Set `services.postBeefServices.services = [{ name, service }]` to replace defaults.
- Merkle-proof pull provider: `services.getMerklePathServices.add({ name, service })` where service is `(txid, services) => Promise<{ name?, merklePath?: MerklePath, header?, error?, notes? }>`. Default providers (WhatsOnChain/Bitails) don't work on teratestnet.
- `ServiceCollection` and `ScriptTemplateBRC29` are **not** re-exported from the package root. We avoid both: mutate the existing `services.*Services` instances, and do BRC-29 derivation with pure `@bsv/sdk`.
- **Pure-change payouts** (`createAction` with only `outputs`, no `inputs`) do **not** call the chaintracker and build their result BEEF from stored data — so runtime payouts don't need live headers/proofs. Headers + proofs are exercised **only by the bootstrap's `internalizeAction`** (`Beef.verify(chainTracker, false)` requires the swept tx mined with a proof).
- `createAction` returns `{ txid, tx }` where `tx` is AtomicBEEF (`number[]`) with source transactions included (default `includeAllSourceTransactions = true`). EF = `Transaction.fromAtomicBEEF(result.tx).toHexEF()`.
- On `acceptDelayedBroadcast: false`, `createAction` broadcasts synchronously via `services.postBeef` and **throws `WERR_REVIEW_ACTIONS` on failure**; catch it and call `wallet.abortAction({ reference })` if the action is still abortable.

**BRC-29 bootstrap derivation (provably matches `internalizeAction`):**
- `internalizeAction` re-derives `privKey = keyDeriver.derivePrivateKey([2,'3241645161d8'], "${derivationPrefix} ${derivationSuffix}", senderIdentityKey)` and requires the output script === `new P2PKH().lock(privKey.toAddress())`.
- Build side (sender = flat WIF, recipient = wallet identity): `derivedPub = PublicKey.fromString(walletIdentityPubHex).deriveChild(flatPrivKey, "2-3241645161d8-${prefix} ${suffix}")`; `lockingScript = new P2PKH().lock(derivedPub.toAddress())`. BRC-42 symmetry guarantees the same hash160 (network prefix is irrelevant — `P2PKH.lock` discards the version byte).
- `paymentRemittance.senderIdentityKey` MUST be `flatPrivKey.toPublicKey().toString()`. `derivationPrefix`/`derivationSuffix` = `Utils.toBase64(Random(16))`. The keyID join is a **single space**.
- Attach proof: `tx.merklePath = MerklePath.fromHex(hex)` → `tx.toAtomicBEEF()` embeds the BUMP; `Beef.verify` checks `isValidRootForHeight(root, blockHeight)` against our chaintracks adapter, so the chaintracks must know that block height's header before internalizing.

---

## File structure

```
faucet/
  package.json  tsconfig.json  next.config.ts  vitest.config.ts
  postcss.config.mjs  tailwind.config.ts  .env.example  .gitignore
  prisma/
    schema.prisma
  lib/
    config.ts             # env validation (zod), exported typed config
    prisma.ts             # Prisma singleton
    address.ts            # testnet P2PKH address validation
    arcade.ts             # arcade HTTP client: broadcastRawTx, getTxStatus
    arcade-chaintracks.ts # ChaintracksClientApi adapter over arcade :8083
    brc29.ts              # pure BRC-29 locking-script derivation (sender side)
    postbeef-result.ts    # pure: map an arcade broadcast result -> toolbox PostBeefResult
    wallet.ts             # toolbox Wallet singleton + payToAddress() (server-only)
    turnstile.ts          # Cloudflare Turnstile server verification
    rate-limit.ts         # sliding-window rate limit over Prisma
    guard.ts              # combine captcha + rate-limit + optional API key
    faucet.ts             # claimToAddress orchestrator
  app/
    layout.tsx  page.tsx  globals.css
    components/
      ClaimForm.tsx
      TurnstileWidget.tsx
    api/
      claim/route.ts
      status/[txid]/route.ts
      health/route.ts
  scripts/
    bootstrap.ts          # one-time treasury sweep → internalizeAction
  data/                   # toolbox sqlite lives here (gitignored)
  tests/                  # vitest specs (or *.test.ts colocated under lib/)
```

---

## Phase 0 — Scaffold

### Task 1: Initialize the project, tooling, and dependencies

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `.gitignore`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`

- [ ] **Step 1: Scaffold Next.js + TypeScript + Tailwind**

Run (non-interactive):
```bash
cd /git/faucet
pnpm dlx create-next-app@latest . --ts --app --tailwind --eslint --src-dir=false --import-alias="@/*" --use-pnpm --no-turbopack --yes
```
Expected: a Next.js App Router project in the current directory (it will keep the existing `docs/` folder).

- [ ] **Step 2: Add runtime + dev dependencies**

```bash
pnpm add @bsv/sdk@^1.10.2 @bsv/wallet-toolbox@1.8.2 knex sqlite3 @prisma/client zod
pnpm add -D prisma vitest @vitejs/plugin-react tsx @types/node
```
Expected: all install without peer-dependency errors. If `@bsv/wallet-toolbox@1.8.2` is missing, run `pnpm view @bsv/wallet-toolbox versions` and pick the latest `1.8.x`; record the chosen version at the top of `.env.example`.

- [ ] **Step 3: Add `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'tests/**/*.test.ts'],
    globals: true,
  },
})
```

- [ ] **Step 4: Add test + script entries to `package.json`**

Add to the `"scripts"` block (keep the `dev`/`build`/`start` lines create-next-app made):
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "bootstrap": "tsx scripts/bootstrap.ts",
    "prisma:migrate": "prisma migrate dev"
  }
}
```

- [ ] **Step 5: Update `.gitignore`**

Append:
```
/data
*.sqlite
*.sqlite-journal
.env
.env.local
prisma/dev.db
```

- [ ] **Step 6: Verify it builds and tests run**

Run: `pnpm test`
Expected: Vitest reports "No test files found" (exit 0) — confirms the runner works.
Run: `pnpm build`
Expected: Next.js build succeeds.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js faucet app with tooling"
```

---

### Task 2: Config module (env validation)

**Files:**
- Create: `lib/config.ts`, `.env.example`
- Test: `lib/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/config.test.ts
import { describe, it, expect } from 'vitest'
import { parseConfig } from './config'

const base = {
  TREASURY_WIF: 'cVtests...',
  WALLET_ROOT_KEY_HEX: '0'.repeat(64),
  ARCADE_URL: 'http://localhost:8080',
  ARCADE_CHAINTRACKS_URL: 'http://localhost:8083/chaintracks/v2',
  WALLET_STORAGE_PATH: './data/wallet.sqlite',
  DATABASE_URL: 'file:./prisma/dev.db',
  TURNSTILE_SECRET_KEY: 'secret',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site',
  FAUCET_PAYOUT_SATS: '100000',
  FAUCET_MAX_SATS: '1000000',
  RATE_LIMIT_WINDOW_MS: '3600000',
  RATE_LIMIT_MAX: '5',
  BOOTSTRAP_SPLIT_COUNT: '20',
}

describe('parseConfig', () => {
  it('parses a valid environment with numeric coercion', () => {
    const cfg = parseConfig(base)
    expect(cfg.FAUCET_PAYOUT_SATS).toBe(100000)
    expect(cfg.RATE_LIMIT_MAX).toBe(5)
    expect(cfg.ARCADE_URL).toBe('http://localhost:8080')
  })

  it('throws when a required field is missing', () => {
    const { ARCADE_URL, ...missing } = base
    expect(() => parseConfig(missing as Record<string, string>)).toThrow()
  })

  it('rejects payout above the max', () => {
    expect(() => parseConfig({ ...base, FAUCET_PAYOUT_SATS: '2000000' })).toThrow()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/config.test.ts`
Expected: FAIL — `parseConfig` is not exported / module not found.

- [ ] **Step 3: Implement `lib/config.ts`**

```ts
import { z } from 'zod'

const schema = z
  .object({
    TREASURY_WIF: z.string().min(1),
    WALLET_ROOT_KEY_HEX: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 32-byte hex'),
    ARCADE_URL: z.string().url(),
    ARCADE_CHAINTRACKS_URL: z.string().url(),
    WALLET_STORAGE_PATH: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    TURNSTILE_SECRET_KEY: z.string().min(1),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
    FAUCET_PAYOUT_SATS: z.coerce.number().int().positive(),
    FAUCET_MAX_SATS: z.coerce.number().int().positive(),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
    RATE_LIMIT_MAX: z.coerce.number().int().positive(),
    BOOTSTRAP_SPLIT_COUNT: z.coerce.number().int().positive(),
  })
  .refine((c) => c.FAUCET_PAYOUT_SATS <= c.FAUCET_MAX_SATS, {
    message: 'FAUCET_PAYOUT_SATS must be <= FAUCET_MAX_SATS',
    path: ['FAUCET_PAYOUT_SATS'],
  })

export type Config = z.infer<typeof schema>

/** Pure parser — unit-testable without touching process.env. */
export function parseConfig(env: Record<string, string | undefined>): Config {
  return schema.parse(env)
}

let cached: Config | null = null
/** Singleton accessor for app code. Throws at first use if env is invalid. */
export function getConfig(): Config {
  if (!cached) cached = parseConfig(process.env)
  return cached
}

/** teratestnet is modeled as toolbox chain 'test'. */
export const CHAIN = 'test' as const
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `.env.example`**

```bash
# @bsv/wallet-toolbox version actually installed (record here): 1.8.2

# Flat treasury key (WIF) that currently holds teratestnet coins — used ONLY by the bootstrap sweep.
TREASURY_WIF=
# Root private key (32-byte hex) for the toolbox server wallet identity. Generate once, keep secret.
WALLET_ROOT_KEY_HEX=
# arcade broadcast + status base URL (serves POST /tx and GET /tx/{txid}).
ARCADE_URL=http://localhost:8080
# arcade chaintracks v2 base URL (headers).
ARCADE_CHAINTRACKS_URL=http://localhost:8083/chaintracks/v2
# Toolbox wallet SQLite file.
WALLET_STORAGE_PATH=./data/wallet.sqlite
# Faucet policy DB (Prisma).
DATABASE_URL=file:./prisma/dev.db
# Cloudflare Turnstile keys.
TURNSTILE_SECRET_KEY=
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
# Payout policy (satoshis).
FAUCET_PAYOUT_SATS=100000
FAUCET_MAX_SATS=1000000
# Rate limit: max claims per window per subject.
RATE_LIMIT_WINDOW_MS=3600000
RATE_LIMIT_MAX=5
# Bootstrap: split the swept treasury into this many parallel-spendable UTXOs.
BOOTSTRAP_SPLIT_COUNT=20
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: typed config module with env validation"
```

---

### Task 3: Prisma schema, singleton, and migration

**Files:**
- Create: `prisma/schema.prisma`, `lib/prisma.ts`
- Test: `lib/prisma.test.ts`

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Claim {
  id             String   @id @default(cuid())
  createdAt      DateTime @default(now())
  recipient      String                 // teratestnet address
  amountSats     Int
  txid           String?
  status         String   @default("pending") // pending | broadcast | failed
  ipHash         String
  apiKeyId       String?
  idempotencyKey String?  @unique
  ef             String?                 // extended-format hex, for idempotent replay

  @@index([ipHash, createdAt])
}

model RateEvent {
  id        String   @id @default(cuid())
  subject   String                 // ipHash or apiKeyId
  kind      String                 // "claim"
  createdAt DateTime @default(now())

  @@index([subject, createdAt])
}

model ApiKey {
  id        String   @id @default(cuid())
  hashedKey String   @unique
  label     String
  tier      Int      @default(1) // multiplies RATE_LIMIT_MAX
  enabled   Boolean  @default(true)
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Create the migration**

Run: `DATABASE_URL="file:./prisma/dev.db" pnpm prisma migrate dev --name init`
Expected: migration created and applied; `@prisma/client` generated.

- [ ] **Step 3: Implement `lib/prisma.ts` (singleton)**

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

- [ ] **Step 4: Write a smoke test for the DB layer**

```ts
// lib/prisma.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { prisma } from './prisma'

describe('prisma', () => {
  beforeAll(() => {
    process.env.DATABASE_URL = 'file:./prisma/dev.db'
  })

  it('can write and read a Claim row', async () => {
    const c = await prisma.claim.create({
      data: { recipient: 'mxxx', amountSats: 1, ipHash: 'h', status: 'pending' },
    })
    const found = await prisma.claim.findUnique({ where: { id: c.id } })
    expect(found?.recipient).toBe('mxxx')
    await prisma.claim.delete({ where: { id: c.id } })
  })
})
```

- [ ] **Step 5: Run the test**

Run: `DATABASE_URL="file:./prisma/dev.db" pnpm vitest run lib/prisma.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: prisma schema, singleton, and initial migration"
```

---

## Phase 1 — arcade + crypto units (TDD with mocked I/O)

### Task 4: Testnet address validation

**Files:**
- Create: `lib/address.ts`
- Test: `lib/address.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/address.test.ts
import { describe, it, expect } from 'vitest'
import { PrivateKey } from '@bsv/sdk'
import { assertTestnetP2PKH, isValidTestnetAddress } from './address'

const testnetAddr = PrivateKey.fromRandom().toPublicKey().toAddress('testnet')
const mainnetAddr = PrivateKey.fromRandom().toPublicKey().toAddress('mainnet')

describe('address validation', () => {
  it('accepts a valid testnet P2PKH address', () => {
    expect(isValidTestnetAddress(testnetAddr)).toBe(true)
    expect(() => assertTestnetP2PKH(testnetAddr)).not.toThrow()
  })

  it('rejects a mainnet address', () => {
    expect(isValidTestnetAddress(mainnetAddr)).toBe(false)
    expect(() => assertTestnetP2PKH(mainnetAddr)).toThrow()
  })

  it('rejects garbage', () => {
    expect(isValidTestnetAddress('not-an-address')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/address.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/address.ts`**

```ts
import { Utils } from '@bsv/sdk'

/** Returns the 20-byte pubkey hash for a valid teratestnet (0x6f) P2PKH address, else throws. */
export function assertTestnetP2PKH(addr: string): number[] {
  let decoded: { data: number[] | string; prefix: number[] | string }
  try {
    decoded = Utils.fromBase58Check(addr)
  } catch {
    throw new Error('Malformed address')
  }
  const prefix = decoded.prefix as number[]
  const data = decoded.data as number[]
  if (!Array.isArray(prefix) || prefix.length !== 1 || prefix[0] !== 0x6f) {
    throw new Error('Not a teratestnet (0x6f) address')
  }
  if (!Array.isArray(data) || data.length !== 20) {
    throw new Error('Not a 20-byte P2PKH hash')
  }
  return data
}

export function isValidTestnetAddress(addr: string): boolean {
  try {
    assertTestnetP2PKH(addr)
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run lib/address.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: teratestnet P2PKH address validation"
```

---

### Task 5: arcade HTTP client

**Files:**
- Create: `lib/arcade.ts`
- Test: `lib/arcade.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/arcade.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { broadcastRawTx, getTxStatus } from './arcade'

const URL = 'http://arcade.test'

function mockFetch(impl: (url: string, init?: RequestInit) => Partial<Response> & { json: () => Promise<unknown> }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => impl(url, init) as unknown as Response))
}

afterEach(() => vi.unstubAllGlobals())

describe('broadcastRawTx', () => {
  it('returns ok=true on 202 submitted', async () => {
    mockFetch(() => ({ status: 202, ok: true, json: async () => ({ status: 'submitted' }) }))
    const r = await broadcastRawTx(URL, 'deadbeef')
    expect(r.ok).toBe(true)
    expect(r.doubleSpend).toBe(false)
  })

  it('treats "already submitted" as ok', async () => {
    mockFetch(() => ({ status: 200, ok: true, json: async () => ({ status: 'already submitted', txid: 'ab', state: 'SEEN_ON_NETWORK' }) }))
    const r = await broadcastRawTx(URL, 'deadbeef')
    expect(r.ok).toBe(true)
    expect(r.alreadyKnown).toBe(true)
  })

  it('flags a double spend', async () => {
    mockFetch(() => ({ status: 200, ok: true, json: async () => ({ status: 'DOUBLE_SPEND_ATTEMPTED' }) }))
    const r = await broadcastRawTx(URL, 'deadbeef')
    expect(r.ok).toBe(false)
    expect(r.doubleSpend).toBe(true)
  })
})

describe('getTxStatus', () => {
  it('parses a MINED status with merklePath', async () => {
    mockFetch(() => ({ status: 200, ok: true, json: async () => ({ txid: 'ab', txStatus: 'MINED', blockHeight: 42, merklePath: 'cafe' }) }))
    const s = await getTxStatus(URL, 'ab')
    expect(s.txStatus).toBe('MINED')
    expect(s.merklePath).toBe('cafe')
    expect(s.blockHeight).toBe(42)
  })

  it('returns null for a 404', async () => {
    mockFetch(() => ({ status: 404, ok: false, json: async () => ({}) }))
    const s = await getTxStatus(URL, 'missing')
    expect(s).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/arcade.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/arcade.ts`**

```ts
export interface BroadcastResult {
  ok: boolean
  txid?: string
  alreadyKnown: boolean
  doubleSpend: boolean
  rejected: boolean
  raw: unknown
}

export interface ArcadeTxStatus {
  txid: string
  txStatus: string
  blockHash?: string
  blockHeight?: number
  merklePath?: string
  raw: unknown
}

/** POST {url}/tx with JSON {rawTx}. arcade returns 202 {status:'submitted'} or {status:'already submitted',...}. */
export async function broadcastRawTx(arcadeUrl: string, rawTxHex: string): Promise<BroadcastResult> {
  const resp = await fetch(`${arcadeUrl}/tx`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ rawTx: rawTxHex }),
  })
  const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>
  const statusStr = String(body.status ?? '')
  const stateStr = String(body.state ?? '')
  const alreadyKnown = statusStr === 'already submitted'
  const submitted = resp.status === 202 || statusStr === 'submitted' || alreadyKnown
  const doubleSpend = /DOUBLE_SPEND/i.test(statusStr) || /DOUBLE_SPEND/i.test(stateStr)
  const rejected = /REJECT/i.test(statusStr) || /REJECT/i.test(stateStr)
  return {
    ok: submitted && !doubleSpend && !rejected,
    txid: typeof body.txid === 'string' ? body.txid : undefined,
    alreadyKnown,
    doubleSpend,
    rejected,
    raw: body,
  }
}

/** GET {url}/tx/{txid}. Returns null on 404. `merklePath` present only once MINED. */
export async function getTxStatus(arcadeUrl: string, txid: string): Promise<ArcadeTxStatus | null> {
  const resp = await fetch(`${arcadeUrl}/tx/${txid}`)
  if (resp.status === 404) return null
  const body = (await resp.json().catch(() => ({}))) as Record<string, unknown>
  return {
    txid: String(body.txid ?? txid),
    txStatus: String(body.txStatus ?? 'UNKNOWN'),
    blockHash: typeof body.blockHash === 'string' ? body.blockHash : undefined,
    blockHeight: typeof body.blockHeight === 'number' ? body.blockHeight : undefined,
    merklePath: typeof body.merklePath === 'string' && body.merklePath.length > 0 ? body.merklePath : undefined,
    raw: body,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run lib/arcade.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Verification step (live arcade — do during Task 8/18, note here)**

When the real `ARCADE_URL` is available, `curl -s $ARCADE_URL/tx/<known-txid> | jq` and confirm the field names (`txStatus`, `merklePath`, `blockHeight`). If they differ, adjust the field reads in `getTxStatus` and re-run the test with the real shape.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: arcade HTTP client (broadcast + status)"
```

---

### Task 6: arcade chaintracks adapter

**Files:**
- Create: `lib/arcade-chaintracks.ts`
- Test: `lib/arcade-chaintracks.test.ts`

This adapter implements the subset of `ChaintracksClientApi` that the toolbox's SPV path actually calls: `getPresentHeight`, `findHeaderForHeight`, `findHeaderForBlockHash`, `currentHeight`, `isValidRootForHeight`, `getChain`. All other interface methods throw `Not implemented` (the toolbox's own `BHServiceClient` does the same, so a partial implementation is accepted).

- [ ] **Step 1: Write the failing test**

```ts
// lib/arcade-chaintracks.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ArcadeChaintracks } from './arcade-chaintracks'

const URL = 'http://arcade.test/chaintracks/v2'
const header = {
  version: 1, previousHash: 'aa', merkleRoot: 'ROOT', time: 1, bits: 1, nonce: 1, height: 42, hash: 'hh',
}

function mockFetch(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    for (const [suffix, value] of Object.entries(routes)) {
      if (url.endsWith(suffix)) return { ok: true, status: 200, json: async () => value } as unknown as Response
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response
  }))
}
afterEach(() => vi.unstubAllGlobals())

describe('ArcadeChaintracks', () => {
  it('getPresentHeight reads /height', async () => {
    mockFetch({ '/height': { height: 42 } })
    const ct = new ArcadeChaintracks('test', URL)
    expect(await ct.getPresentHeight()).toBe(42)
  })

  it('findHeaderForHeight reads /header/height/{h}', async () => {
    mockFetch({ '/header/height/42': header })
    const ct = new ArcadeChaintracks('test', URL)
    const h = await ct.findHeaderForHeight(42)
    expect(h?.merkleRoot).toBe('ROOT')
  })

  it('isValidRootForHeight compares the stored merkleRoot', async () => {
    mockFetch({ '/header/height/42': header })
    const ct = new ArcadeChaintracks('test', URL)
    expect(await ct.isValidRootForHeight('ROOT', 42)).toBe(true)
    expect(await ct.isValidRootForHeight('WRONG', 42)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/arcade-chaintracks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/arcade-chaintracks.ts`**

```ts
// Minimal ChaintracksClientApi implementation backed by arcade's /chaintracks/v2 routes.
// Only the methods the toolbox SPV path calls are implemented; the rest throw.

export interface BlockHeaderLike {
  version: number
  previousHash: string
  merkleRoot: string
  time: number
  bits: number
  nonce: number
  height: number
  hash: string
}

export class ArcadeChaintracks {
  constructor(private readonly chain: 'main' | 'test', private readonly baseUrl: string) {}

  private async getJson<T>(path: string): Promise<T | undefined> {
    const resp = await fetch(`${this.baseUrl}${path}`)
    if (!resp.ok) return undefined
    return (await resp.json()) as T
  }

  async getChain(): Promise<'main' | 'test'> {
    return this.chain
  }

  async getPresentHeight(): Promise<number> {
    const r = await this.getJson<{ height: number }>('/height')
    if (!r || typeof r.height !== 'number') throw new Error('chaintracks /height unavailable')
    return r.height
  }

  async currentHeight(): Promise<number> {
    return this.getPresentHeight()
  }

  async findHeaderForHeight(height: number): Promise<BlockHeaderLike | undefined> {
    return this.getJson<BlockHeaderLike>(`/header/height/${height}`)
  }

  async findHeaderForBlockHash(hash: string): Promise<BlockHeaderLike | undefined> {
    return this.getJson<BlockHeaderLike>(`/header/hash/${hash}`)
  }

  async isValidRootForHeight(root: string, height: number): Promise<boolean> {
    const h = await this.findHeaderForHeight(height)
    return !!h && h.merkleRoot === root
  }

  // --- Unused ChaintracksClientApi surface: throw (mirrors BHServiceClient) ---
  private notImplemented(): never {
    throw new Error('Not implemented')
  }
  getInfo(): never { return this.notImplemented() }
  getHeaders(): never { return this.notImplemented() }
  findChainTipHeader(): never { return this.notImplemented() }
  findChainTipHash(): never { return this.notImplemented() }
  addHeader(): never { return this.notImplemented() }
  startListening(): never { return this.notImplemented() }
  listening(): never { return this.notImplemented() }
  isListening(): never { return this.notImplemented() }
  isSynchronized(): never { return this.notImplemented() }
  subscribeHeaders(): never { return this.notImplemented() }
  subscribeReorgs(): never { return this.notImplemented() }
  unsubscribe(): never { return this.notImplemented() }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run lib/arcade-chaintracks.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verification note**

In Task 8, when assigning to `services.options.chaintracks`, TypeScript may require the full `ChaintracksClientApi` shape. If so, cast at the assignment site: `services.options.chaintracks = new ArcadeChaintracks(CHAIN, url) as unknown as <ChaintracksClientApi type>`. Confirm against your live arcade that `/chaintracks/v2/height` and `/header/height/{h}` return the documented JSON; if the field is `merkle_root` (snake_case) rather than `merkleRoot`, map it here.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: arcade chaintracks adapter for SPV headers"
```

---

### Task 7: BRC-29 locking-script derivation (sender side)

**Files:**
- Create: `lib/brc29.ts`
- Test: `lib/brc29.test.ts`

This is the pure derivation used by the bootstrap. The test proves sender-built address == recipient-rederived address (the property `internalizeAction` checks).

- [ ] **Step 1: Write the failing test**

```ts
// lib/brc29.test.ts
import { describe, it, expect } from 'vitest'
import { PrivateKey } from '@bsv/sdk'
import { deriveBrc29, brc29InvoiceNumber } from './brc29'

describe('BRC-29 derivation', () => {
  it('sender-derived locking script matches the recipient re-derivation', () => {
    const sender = PrivateKey.fromRandom()
    const recipient = PrivateKey.fromRandom()
    const derivationPrefix = 'cHJlZml4'
    const derivationSuffix = 'c3VmZml4'

    const { lockingScriptHex } = deriveBrc29({
      recipientIdentityKeyHex: recipient.toPublicKey().toString(),
      senderPrivateKey: sender,
      derivationPrefix,
      derivationSuffix,
    })

    // Recipient side: derivePrivateKey(counterparty=sender pub, invoiceNumber) -> address -> P2PKH
    const inv = brc29InvoiceNumber(derivationPrefix, derivationSuffix)
    const recipientPriv = recipient.deriveChild(sender.toPublicKey(), inv)
    const { P2PKH } = require('@bsv/sdk')
    const expected = new P2PKH().lock(recipientPriv.toAddress()).toHex()

    expect(lockingScriptHex).toBe(expected)
  })

  it('invoice number uses protocol 3241645161d8 and a single-space keyID', () => {
    expect(brc29InvoiceNumber('a', 'b')).toBe('2-3241645161d8-a b')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/brc29.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/brc29.ts`**

```ts
import { PrivateKey, PublicKey, P2PKH, Random, Utils } from '@bsv/sdk'

export const BRC29_PROTOCOL_HEX = '3241645161d8'

/** Invoice number form used by BRC-29 / type-42: `2-3241645161d8-<prefix> <suffix>` (single space). */
export function brc29InvoiceNumber(derivationPrefix: string, derivationSuffix: string): string {
  return `2-${BRC29_PROTOCOL_HEX}-${derivationPrefix} ${derivationSuffix}`
}

/** Generate fresh per-payment derivation values (16 random bytes, base64), matching the toolbox convention. */
export function newDerivationValues(): { derivationPrefix: string; derivationSuffix: string } {
  return {
    derivationPrefix: Utils.toBase64(Random(16)),
    derivationSuffix: Utils.toBase64(Random(16)),
  }
}

export interface DeriveBrc29Args {
  recipientIdentityKeyHex: string
  senderPrivateKey: PrivateKey
  derivationPrefix: string
  derivationSuffix: string
}

/**
 * Sender-side BRC-29 derivation: compute the P2PKH locking script payable to `recipient`,
 * such that the recipient wallet can re-derive the spending key from
 * (senderIdentityKey, derivationPrefix, derivationSuffix). BRC-42 symmetry guarantees the
 * sender-derived public key equals the recipient-derived private key's public key.
 */
export function deriveBrc29(args: DeriveBrc29Args): {
  lockingScriptHex: string
  senderIdentityKeyHex: string
} {
  const inv = brc29InvoiceNumber(args.derivationPrefix, args.derivationSuffix)
  const recipientPub = PublicKey.fromString(args.recipientIdentityKeyHex)
  const derivedPub = recipientPub.deriveChild(args.senderPrivateKey, inv)
  const lockingScriptHex = new P2PKH().lock(derivedPub.toAddress()).toHex()
  return {
    lockingScriptHex,
    senderIdentityKeyHex: args.senderPrivateKey.toPublicKey().toString(),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run lib/brc29.test.ts`
Expected: PASS (2 tests). This confirms the derivation property `internalizeAction` enforces.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: pure BRC-29 sender-side locking-script derivation"
```

---

## Phase 2 — Wallet engine (integration)

### Task 8: Toolbox wallet engine + payToAddress

**Files:**
- Create: `lib/postbeef-result.ts` (pure), `lib/wallet.ts` (server-only)
- Test: `lib/postbeef-result.test.ts`

The pure, unit-testable seam is the mapping from an arcade broadcast result to the toolbox's `PostBeefResult`. We keep it in its own module so the test never imports `lib/wallet.ts` (which is `server-only` and pulls in the whole toolbox). The wallet assembly + `payToAddress` are integration code, smoke-verified against a temp SQLite (no network needed to *construct* the wallet; actual payout is exercised in Task 18 once funded).

- [ ] **Step 1: Write the failing test (the broadcast-result mapping)**

```ts
// lib/postbeef-result.test.ts
import { describe, it, expect } from 'vitest'
import { makeArcadePostBeefResult } from './postbeef-result'

describe('makeArcadePostBeefResult', () => {
  it('maps a successful arcade broadcast to a success PostBeefResult', () => {
    const r = makeArcadePostBeefResult(['ab'], { ok: true, alreadyKnown: false, doubleSpend: false, rejected: false, raw: {} })
    expect(r.status).toBe('success')
    expect(r.txidResults[0]).toMatchObject({ txid: 'ab', status: 'success' })
  })

  it('maps a double spend', () => {
    const r = makeArcadePostBeefResult(['ab'], { ok: false, alreadyKnown: false, doubleSpend: true, rejected: false, raw: {} })
    expect(r.status).toBe('error')
    expect(r.txidResults[0].doubleSpend).toBe(true)
  })

  it('marks transport failure as serviceError (retryable)', () => {
    const r = makeArcadePostBeefResult(['ab'], { ok: false, alreadyKnown: false, doubleSpend: false, rejected: false, raw: {} })
    expect(r.txidResults[0].serviceError).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/postbeef-result.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/postbeef-result.ts`**

```ts
import type { BroadcastResult } from './arcade'

// Structural shape matching the toolbox's PostBeefResult (sdk.PostBeefResult).
export interface PostTxResultForTxid {
  txid: string
  status: 'success' | 'error'
  alreadyKnown?: boolean
  doubleSpend?: boolean
  serviceError?: boolean
}
export interface PostBeefResult {
  name: string
  status: 'success' | 'error'
  txidResults: PostTxResultForTxid[]
  data?: unknown
}

export function makeArcadePostBeefResult(txids: string[], b: BroadcastResult): PostBeefResult {
  const status = b.ok ? 'success' : 'error'
  return {
    name: 'arcade',
    status,
    data: b.raw,
    txidResults: txids.map((txid) => ({
      txid,
      status,
      alreadyKnown: b.alreadyKnown || undefined,
      doubleSpend: b.doubleSpend || undefined,
      // serviceError = transport/unknown failure (retryable). REJECTED/DoubleSpend is NOT serviceError.
      serviceError: !b.ok && !b.rejected && !b.doubleSpend ? true : undefined,
    })),
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run lib/postbeef-result.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement `lib/wallet.ts`**

> Note on types: `@bsv/wallet-toolbox` exposes its SDK types under the `sdk` namespace export (`import { sdk } from '@bsv/wallet-toolbox'`). If the toolbox rejects the `postBeefServices.services` assignment or the `options.chaintracks` cast, annotate the service function as `sdk.PostBeefService` and cast the chaintracks object to the type `options.chaintracks` expects — only satisfy the types, do not change behavior.

```ts
import 'server-only'
import {
  Wallet,
  WalletStorageManager,
  StorageKnex,
  Services,
} from '@bsv/wallet-toolbox'
import {
  PrivateKey,
  CachedKeyDeriver,
  Transaction,
  MerklePath,
  P2PKH,
  Beef,
  Utils,
  Random,
} from '@bsv/sdk'
import { knex as makeKnex } from 'knex'
import { getConfig, CHAIN } from './config'
import { broadcastRawTx, getTxStatus } from './arcade'
import { ArcadeChaintracks } from './arcade-chaintracks'
import { makeArcadePostBeefResult } from './postbeef-result'

// ---- Wallet singleton ----
let walletPromise: Promise<{ wallet: Wallet; identityKey: string; services: Services }> | null = null

export function getWallet() {
  if (!walletPromise) walletPromise = buildWallet()
  return walletPromise
}

async function buildWallet() {
  const cfg = getConfig()
  const rootKey = PrivateKey.fromHex(cfg.WALLET_ROOT_KEY_HEX)
  const keyDeriver = new CachedKeyDeriver(rootKey)
  const identityKey = rootKey.toPublicKey().toString()

  const storage = new WalletStorageManager(identityKey)
  const knex = makeKnex({
    client: 'sqlite3',
    connection: { filename: cfg.WALLET_STORAGE_PATH },
    useNullAsDefault: true,
  })
  const activeStorage = new StorageKnex({
    chain: CHAIN,
    knex,
    commissionSatoshis: 0,
    commissionPubKeyHex: undefined,
    feeModel: { model: 'sat/kb', value: 1 },
  })
  await activeStorage.migrate('faucet', Utils.toHex(Random(33)))
  await activeStorage.makeAvailable()
  await storage.addWalletStorageProvider(activeStorage)
  await activeStorage.findOrInsertUser(identityKey)

  const options = Services.createDefaultOptions(CHAIN)
  options.chaintracks = new ArcadeChaintracks(CHAIN, cfg.ARCADE_CHAINTRACKS_URL) as unknown as typeof options.chaintracks
  const services = new Services(options)

  // Replace broadcast services with a single arcade POST /tx service.
  services.postBeefServices.services = [
    {
      name: 'arcade',
      service: async (beef: Beef, txids: string[]) => {
        const subjectTxid = txids[txids.length - 1]
        const tx = beef.findAtomicTransaction(subjectTxid) ?? beef.findTxid(subjectTxid)?.tx
        if (!tx) {
          return makeArcadePostBeefResult(txids, { ok: false, alreadyKnown: false, doubleSpend: false, rejected: false, raw: { error: 'tx not found in beef' } })
        }
        const b = await broadcastRawTx(cfg.ARCADE_URL, tx.toHex())
        return makeArcadePostBeefResult(txids, b)
      },
    },
  ] as typeof services.postBeefServices.services

  // Add arcade as a merkle-proof source (used by bootstrap / background proof checks).
  services.getMerklePathServices.add({
    name: 'arcade',
    service: async (txid: string) => {
      const st = await getTxStatus(cfg.ARCADE_URL, txid)
      if (!st || st.txStatus !== 'MINED' || !st.merklePath) return { name: 'arcade', notes: [] }
      return { name: 'arcade', merklePath: MerklePath.fromHex(st.merklePath) }
    },
  })

  const wallet = new Wallet({ chain: CHAIN, keyDeriver, storage, services })
  return { wallet, identityKey, services }
}

/**
 * Build, sign, broadcast (via arcade) a P2PKH payout to `address` and return the EF.
 * Two-phase flow (createAction signAndProcess:false -> signAction) so we hold a `reference`
 * and can abortAction on broadcast failure, releasing the reserved inputs. Pure-change
 * payout (no explicit inputs) means no live chaintracks is required.
 */
export async function payToAddress(address: string, satoshis: number): Promise<{ txid: string; ef: string }> {
  const { wallet } = await getWallet()
  const lockingScript = new P2PKH().lock(address).toHex()

  const created = await wallet.createAction({
    description: 'teratestnet faucet payout',
    outputs: [{ lockingScript, satoshis, outputDescription: 'faucet payout' }],
    options: { signAndProcess: false, acceptDelayedBroadcast: false, randomizeOutputs: false },
  })

  const reference = created.signableTransaction?.reference
  if (!reference) {
    // Nothing to sign (unexpected for a change-funded payout) — use the direct result if present.
    if (created.txid && created.tx) {
      return { txid: created.txid, ef: Transaction.fromAtomicBEEF(created.tx).toHexEF() }
    }
    throw new Error('createAction returned neither a signable transaction nor a completed tx')
  }

  try {
    // spends: {} -> the wallet signs its own change inputs; broadcast happens synchronously.
    const signed = await wallet.signAction({ reference, spends: {}, options: { acceptDelayedBroadcast: false } })
    if (!signed.txid || !signed.tx) throw new Error('signAction did not return a broadcast transaction')
    return { txid: signed.txid, ef: Transaction.fromAtomicBEEF(signed.tx).toHexEF() }
  } catch (e) {
    // Release the reserved inputs so the pool isn't depleted by a failed broadcast.
    await wallet.abortAction({ reference }).catch(() => {})
    throw e
  }
}
```

- [ ] **Step 6: Type-check the wallet assembly**

Run: `pnpm exec tsc --noEmit`
Expected: no type errors. If the `postBeefServices.services` assignment or `options.chaintracks` cast is rejected, follow the inline note (annotate with `sdk.PostBeefService`, cast chaintracks). Do not change behavior — only satisfy the types.

- [ ] **Step 7: Integration smoke (wallet constructs against a temp DB)**

Add and run (then delete) a throwaway script `scripts/_smoke.ts`:
```ts
import { getWallet } from '../lib/wallet'
getWallet().then(({ identityKey }) => { console.log('wallet identity:', identityKey); process.exit(0) })
  .catch((e) => { console.error(e); process.exit(1) })
```
Run: `WALLET_STORAGE_PATH=./data/smoke.sqlite <all other env> pnpm tsx scripts/_smoke.ts`
Expected: prints a 66-char hex identity key, exit 0 (no network call — construction only). Then `rm scripts/_smoke.ts data/smoke.sqlite`.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: toolbox wallet engine wired to arcade (broadcast + proofs + headers)"
```

---

### Task 9: Treasury bootstrap script

**Files:**
- Create: `scripts/bootstrap.ts`

This is a **one-time operational script**, not a unit-tested module. It sweeps the flat `TREASURY_WIF` UTXOs into BRC-29 outputs payable to the wallet identity (split into `BOOTSTRAP_SPLIT_COUNT`), broadcasts via arcade, waits for each to be MINED, attaches the proof, and `internalizeAction`s them so the toolbox tracks them as spendable change.

> **Source of treasury UTXOs:** the flat WIF's unspent outputs must be discoverable. arcade does not list UTXOs by address. Supply them via an env/JSON file `TREASURY_UTXOS` = `[{ "txid", "vout", "satoshis", "sourceRawTxHex" }]` (the operator exports these from wherever the treasury was funded). The script reads that file. Confirm this is how the operator will provide the seed funds during the Task 18 dry run.

- [ ] **Step 1: Implement `scripts/bootstrap.ts`**

```ts
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { PrivateKey, P2PKH, Transaction, MerklePath, SatoshisPerKilobyte, LockingScript } from '@bsv/sdk'
import { getConfig } from '../lib/config'
import { deriveBrc29, newDerivationValues } from '../lib/brc29'
import { broadcastRawTx, getTxStatus } from '../lib/arcade'
import { getWallet } from '../lib/wallet'

interface SeedUtxo { txid: string; vout: number; satoshis: number; sourceRawTxHex: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitForProof(arcadeUrl: string, txid: string, timeoutMs = 30 * 60_000): Promise<string> {
  const start = Date.now()
  // NOTE: scripts run outside the harness; Date.now() is fine here.
  for (;;) {
    const st = await getTxStatus(arcadeUrl, txid)
    if (st?.txStatus === 'MINED' && st.merklePath) return st.merklePath
    if (st?.txStatus === 'REJECTED' || st?.txStatus === 'DOUBLE_SPEND_ATTEMPTED') {
      throw new Error(`tx ${txid} failed: ${st.txStatus}`)
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for proof of ${txid}`)
    console.log(`  ${txid}: ${st?.txStatus ?? 'unknown'} — waiting...`)
    await sleep(15_000)
  }
}

async function main() {
  const cfg = getConfig()
  const { wallet, identityKey } = await getWallet()
  const flatKey = PrivateKey.fromWif(cfg.TREASURY_WIF)
  const senderIdentityKeyHex = flatKey.toPublicKey().toString()

  const seedUtxos: SeedUtxo[] = JSON.parse(readFileSync(process.env.TREASURY_UTXOS_FILE ?? './treasury-utxos.json', 'utf8'))
  const totalIn = seedUtxos.reduce((s, u) => s + u.satoshis, 0)
  console.log(`Sweeping ${seedUtxos.length} UTXOs (${totalIn} sat) into ${cfg.BOOTSTRAP_SPLIT_COUNT} outputs...`)

  // Build the sweep tx: flat WIF inputs -> N BRC-29 outputs payable to the wallet identity.
  const tx = new Transaction()
  for (const u of seedUtxos) {
    tx.addInput({
      sourceTransaction: Transaction.fromHex(u.sourceRawTxHex),
      sourceOutputIndex: u.vout,
      unlockingScriptTemplate: new P2PKH().unlock(flatKey),
    })
  }

  // One derivation per output; remember them for internalizeAction.
  const fee = 1000 // generous flat fee in sat; refined below by tx.fee()
  const perOutput = Math.floor((totalIn - fee) / cfg.BOOTSTRAP_SPLIT_COUNT)
  if (perOutput < 1000) throw new Error('treasury too small for the requested split count')

  const outs: { derivationPrefix: string; derivationSuffix: string; outputIndex: number }[] = []
  for (let i = 0; i < cfg.BOOTSTRAP_SPLIT_COUNT; i++) {
    const { derivationPrefix, derivationSuffix } = newDerivationValues()
    const { lockingScriptHex } = deriveBrc29({
      recipientIdentityKeyHex: identityKey,
      senderPrivateKey: flatKey,
      derivationPrefix,
      derivationSuffix,
    })
    tx.addOutput({ lockingScript: LockingScript.fromHex(lockingScriptHex), satoshis: perOutput })
    outs.push({ derivationPrefix, derivationSuffix, outputIndex: i })
  }
  // change back to the flat key
  tx.addOutput({ lockingScript: new P2PKH().lock(flatKey.toAddress('testnet')), change: true })

  await tx.fee(new SatoshisPerKilobyte(1))
  await tx.sign()
  const txid = tx.id('hex')
  console.log('Sweep txid:', txid)

  // Broadcast via arcade.
  const b = await broadcastRawTx(cfg.ARCADE_URL, tx.toHex())
  if (!b.ok) throw new Error(`broadcast failed: ${JSON.stringify(b.raw)}`)
  console.log('Broadcast accepted. Waiting for it to be mined + proven by arcade...')

  // Wait for the proof, attach it, internalize each output.
  const merklePathHex = await waitForProof(cfg.ARCADE_URL, txid)
  tx.merklePath = MerklePath.fromHex(merklePathHex)
  const atomicBEEF = tx.toAtomicBEEF()

  for (const o of outs) {
    await wallet.internalizeAction({
      tx: atomicBEEF,
      description: 'treasury bootstrap sweep',
      labels: ['bootstrap'],
      outputs: [
        {
          outputIndex: o.outputIndex,
          protocol: 'wallet payment',
          paymentRemittance: {
            derivationPrefix: o.derivationPrefix,
            derivationSuffix: o.derivationSuffix,
            senderIdentityKey: senderIdentityKeyHex,
          },
        },
      ],
    })
    console.log(`  internalized output ${o.outputIndex}`)
  }

  const bal = await wallet.balance?.()
  console.log('Bootstrap complete. Wallet balance:', bal)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
```

- [ ] **Step 2: Add the `dotenv` dev dependency the script needs**

Run: `pnpm add -D dotenv`

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. If `wallet.balance` isn't a method on this toolbox version, replace the final balance log with `wallet.listOutputs({ basket: 'default' })` length, or remove it.

- [ ] **Step 4: Manual verification (deferred to when a funded teratestnet treasury + arcade are available — Task 18)**

This script can only be exercised end-to-end with a funded `TREASURY_WIF`, a `treasury-utxos.json`, and a reachable arcade. Mark this task's manual run as part of Task 18. Until then, type-check is the gate.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: treasury bootstrap sweep + internalize script"
```

---

## Phase 3 — Policy units (TDD)

### Task 10: Turnstile verification

**Files:**
- Create: `lib/turnstile.ts`
- Test: `lib/turnstile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/turnstile.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { verifyTurnstile } from './turnstile'

afterEach(() => vi.unstubAllGlobals())

describe('verifyTurnstile', () => {
  it('returns true when Cloudflare reports success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: true, 'error-codes': [] }) }) as unknown as Response))
    expect(await verifyTurnstile('secret', 'token', '1.2.3.4')).toBe(true)
  })

  it('returns false on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }) }) as unknown as Response))
    expect(await verifyTurnstile('secret', 'bad')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/turnstile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/turnstile.ts`**

```ts
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstile(secret: string, token: string, ip?: string): Promise<boolean> {
  const form = new URLSearchParams()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  const resp = await fetch(SITEVERIFY, { method: 'POST', body: form })
  if (!resp.ok) return false
  const data = (await resp.json()) as { success?: boolean }
  return data.success === true
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run lib/turnstile.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Cloudflare Turnstile server verification"
```

---

### Task 11: Sliding-window rate limit

**Files:**
- Create: `lib/rate-limit.ts`
- Test: `lib/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/rate-limit.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { prisma } from './prisma'
import { checkAndRecord } from './rate-limit'

describe('checkAndRecord', () => {
  beforeAll(() => { process.env.DATABASE_URL = 'file:./prisma/dev.db' })
  beforeEach(async () => { await prisma.rateEvent.deleteMany({ where: { subject: 'subj-test' } }) })

  it('allows up to the limit then blocks', async () => {
    const opts = { subject: 'subj-test', limit: 3, windowMs: 60_000 }
    expect((await checkAndRecord(opts)).allowed).toBe(true)
    expect((await checkAndRecord(opts)).allowed).toBe(true)
    expect((await checkAndRecord(opts)).allowed).toBe(true)
    const blocked = await checkAndRecord(opts)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL="file:./prisma/dev.db" pnpm vitest run lib/rate-limit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/rate-limit.ts`**

```ts
import { prisma } from './prisma'

export interface RateLimitOptions {
  subject: string
  limit: number
  windowMs: number
}
export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterMs: number
}

/** Sliding window: count events for subject within the window; record one if allowed. */
export async function checkAndRecord(opts: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now()
  const cutoff = new Date(now - opts.windowMs)
  const events = await prisma.rateEvent.findMany({
    where: { subject: opts.subject, createdAt: { gt: cutoff } },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  })
  if (events.length >= opts.limit) {
    const oldest = events[0].createdAt.getTime()
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, oldest + opts.windowMs - now) }
  }
  await prisma.rateEvent.create({ data: { subject: opts.subject, kind: 'claim' } })
  return { allowed: true, remaining: opts.limit - events.length - 1, retryAfterMs: 0 }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL="file:./prisma/dev.db" pnpm vitest run lib/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: sliding-window rate limiting over Prisma"
```

---

### Task 12: Guard (captcha + rate limit + optional API key)

**Files:**
- Create: `lib/guard.ts`
- Test: `lib/guard.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/guard.test.ts
import { describe, it, expect, vi } from 'vitest'
import { hashIp } from './guard'

describe('hashIp', () => {
  it('is deterministic and not the raw IP', () => {
    const a = hashIp('1.2.3.4')
    const b = hashIp('1.2.3.4')
    expect(a).toBe(b)
    expect(a).not.toContain('1.2.3.4')
    expect(a).toHaveLength(64) // sha256 hex
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run lib/guard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/guard.ts`**

```ts
import { createHash } from 'node:crypto'
import { prisma } from './prisma'
import { getConfig } from './config'
import { verifyTurnstile } from './turnstile'
import { checkAndRecord } from './rate-limit'

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex')
}

export interface GuardContext {
  ip: string
  captchaToken?: string
  apiKey?: string
}
export type GuardResult =
  | { ok: true; subject: string; apiKeyId?: string }
  | { ok: false; code: 'captcha' | 'rate_limit' | 'unauthorized'; status: number; retryAfterMs?: number; message: string }

/**
 * Order: if a valid API key is presented, skip captcha and apply a higher limit.
 * Otherwise require a passing Turnstile token, then apply the per-IP rate limit.
 */
export async function guard(ctx: GuardContext): Promise<GuardResult> {
  const cfg = getConfig()

  // API key path
  if (ctx.apiKey) {
    const hashed = createHash('sha256').update(ctx.apiKey).digest('hex')
    const key = await prisma.apiKey.findUnique({ where: { hashedKey: hashed } })
    if (!key || !key.enabled) {
      return { ok: false, code: 'unauthorized', status: 401, message: 'Invalid API key' }
    }
    const rl = await checkAndRecord({ subject: key.id, limit: cfg.RATE_LIMIT_MAX * key.tier, windowMs: cfg.RATE_LIMIT_WINDOW_MS })
    if (!rl.allowed) return { ok: false, code: 'rate_limit', status: 429, retryAfterMs: rl.retryAfterMs, message: 'Rate limit exceeded' }
    return { ok: true, subject: key.id, apiKeyId: key.id }
  }

  // Public path: captcha required.
  if (!ctx.captchaToken || !(await verifyTurnstile(cfg.TURNSTILE_SECRET_KEY, ctx.captchaToken, ctx.ip))) {
    return { ok: false, code: 'captcha', status: 403, message: 'Captcha verification failed' }
  }
  const subject = hashIp(ctx.ip)
  const rl = await checkAndRecord({ subject, limit: cfg.RATE_LIMIT_MAX, windowMs: cfg.RATE_LIMIT_WINDOW_MS })
  if (!rl.allowed) return { ok: false, code: 'rate_limit', status: 429, retryAfterMs: rl.retryAfterMs, message: 'Rate limit exceeded' }
  return { ok: true, subject }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run lib/guard.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: request guard (captcha + rate limit + API key)"
```

---

## Phase 4 — Orchestrator + API

### Task 13: Claim orchestrator

**Files:**
- Create: `lib/faucet.ts`
- Test: `lib/faucet.test.ts`

The orchestrator depends on `payToAddress` (wallet) and the store. We inject `payToAddress` so the test can run without a funded wallet.

- [ ] **Step 1: Write the failing test**

```ts
// lib/faucet.test.ts
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { prisma } from './prisma'
import { claimToAddress } from './faucet'
import { PrivateKey } from '@bsv/sdk'

const addr = PrivateKey.fromRandom().toPublicKey().toAddress('testnet')

describe('claimToAddress', () => {
  beforeAll(() => { process.env.DATABASE_URL = 'file:./prisma/dev.db' })

  it('rejects an invalid address before paying', async () => {
    const pay = vi.fn()
    await expect(
      claimToAddress({ address: 'bad', amountSats: 100, ipHash: 'h' }, { pay }),
    ).rejects.toThrow(/address/i)
    expect(pay).not.toHaveBeenCalled()
  })

  it('caps the amount, pays, and records a Claim', async () => {
    const pay = vi.fn(async () => ({ txid: 'tx123', ef: '00ef' }))
    const r = await claimToAddress(
      { address: addr, amountSats: 999_999_999, ipHash: 'h', maxSats: 500, defaultSats: 100 },
      { pay },
    )
    expect(r.txid).toBe('tx123')
    expect(pay).toHaveBeenCalledWith(addr, 500) // capped
    const row = await prisma.claim.findFirst({ where: { txid: 'tx123' } })
    expect(row?.status).toBe('broadcast')
    await prisma.claim.deleteMany({ where: { txid: 'tx123' } })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `DATABASE_URL="file:./prisma/dev.db" pnpm vitest run lib/faucet.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `lib/faucet.ts`**

```ts
import { prisma } from './prisma'
import { assertTestnetP2PKH } from './address'
import { getConfig } from './config'

export interface ClaimRequest {
  address: string
  amountSats?: number
  ipHash: string
  apiKeyId?: string
  idempotencyKey?: string
  // test overrides (default to config in production)
  maxSats?: number
  defaultSats?: number
}

export interface ClaimResult {
  txid: string
  ef: string
  amountSats: number
}

export interface FaucetDeps {
  pay: (address: string, satoshis: number) => Promise<{ txid: string; ef: string }>
}

export async function claimToAddress(req: ClaimRequest, deps: FaucetDeps): Promise<ClaimResult> {
  // 1. Validate address (throws on bad input, before any payout).
  assertTestnetP2PKH(req.address)

  // 2. Idempotency: replay a prior result if the key was seen.
  if (req.idempotencyKey) {
    const prior = await prisma.claim.findUnique({ where: { idempotencyKey: req.idempotencyKey } })
    if (prior && prior.txid && prior.ef) {
      return { txid: prior.txid, ef: prior.ef, amountSats: prior.amountSats }
    }
  }

  // 3. Resolve + cap amount.
  let defaultSats = req.defaultSats
  let maxSats = req.maxSats
  if (defaultSats === undefined || maxSats === undefined) {
    const cfg = getConfig()
    defaultSats = defaultSats ?? cfg.FAUCET_PAYOUT_SATS
    maxSats = maxSats ?? cfg.FAUCET_MAX_SATS
  }
  const requested = req.amountSats ?? defaultSats
  const amountSats = Math.min(requested, maxSats)

  // 4. Create a pending claim row (captures idempotency key uniqueness).
  const claim = await prisma.claim.create({
    data: {
      recipient: req.address,
      amountSats,
      ipHash: req.ipHash,
      apiKeyId: req.apiKeyId ?? null,
      idempotencyKey: req.idempotencyKey ?? null,
      status: 'pending',
    },
  })

  // 5. Pay.
  try {
    const { txid, ef } = await deps.pay(req.address, amountSats)
    await prisma.claim.update({ where: { id: claim.id }, data: { txid, ef, status: 'broadcast' } })
    return { txid, ef, amountSats }
  } catch (e) {
    await prisma.claim.update({ where: { id: claim.id }, data: { status: 'failed' } })
    throw e
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `DATABASE_URL="file:./prisma/dev.db" pnpm vitest run lib/faucet.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: claim orchestrator (validate, cap, idempotency, record)"
```

---

### Task 14: `POST /api/claim` route

**Files:**
- Create: `app/api/claim/route.ts`
- Test: `app/api/claim/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/api/claim/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the heavy deps so the route can be tested in isolation.
// hashIp must be a real (stubbed) function because the success path calls it.
vi.mock('@/lib/guard', () => ({ guard: vi.fn(), hashIp: (ip: string) => `hash:${ip}` }))
vi.mock('@/lib/faucet', () => ({ claimToAddress: vi.fn() }))
vi.mock('@/lib/wallet', () => ({ payToAddress: vi.fn() }))

import { POST } from './route'
import { guard } from '@/lib/guard'
import { claimToAddress } from '@/lib/faucet'

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://x/api/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '9.9.9.9', ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/claim', () => {
  it('400 on invalid body', async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('403 when the guard rejects the captcha', async () => {
    ;(guard as any).mockResolvedValue({ ok: false, code: 'captcha', status: 403, message: 'no' })
    const res = await POST(req({ address: 'mxyz', captchaToken: 't' }))
    expect(res.status).toBe(403)
  })

  it('200 with txid + ef on success', async () => {
    ;(guard as any).mockResolvedValue({ ok: true, subject: 's' })
    ;(claimToAddress as any).mockResolvedValue({ txid: 'tx1', ef: '00ef', amountSats: 100 })
    const res = await POST(req({ address: 'mxyz', captchaToken: 't' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ txid: 'tx1', ef: '00ef', network: 'teratestnet' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run app/api/claim/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement `app/api/claim/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { guard, hashIp } from '@/lib/guard'
import { claimToAddress } from '@/lib/faucet'
import { payToAddress } from '@/lib/wallet'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
}

const BodySchema = z.object({
  address: z.string().min(26).max(64),
  amount: z.number().int().positive().optional(),
  captchaToken: z.string().min(1).optional(),
})

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body', code: 'bad_request' }, { status: 400, headers: CORS })
  }
  const ip = clientIp(req)
  const apiKey = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || undefined
  const idempotencyKey = req.headers.get('idempotency-key') || undefined

  const g = await guard({ ip, captchaToken: parsed.data.captchaToken, apiKey })
  if (!g.ok) {
    const headers: Record<string, string> = { ...CORS }
    if (g.code === 'rate_limit' && g.retryAfterMs) headers['Retry-After'] = String(Math.ceil(g.retryAfterMs / 1000))
    return NextResponse.json({ error: g.message, code: g.code }, { status: g.status, headers })
  }

  try {
    const result = await claimToAddress(
      {
        address: parsed.data.address,
        amountSats: parsed.data.amount,
        ipHash: g.apiKeyId ? `apikey:${g.apiKeyId}` : hashIp(ip),
        apiKeyId: g.apiKeyId,
        idempotencyKey,
      },
      { pay: payToAddress },
    )
    return NextResponse.json(
      {
        txid: result.txid,
        ef: result.ef,
        outputs: [{ vout: 0, satoshis: result.amountSats, address: parsed.data.address }],
        network: 'teratestnet',
      },
      { status: 200, headers: CORS },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    if (/address/i.test(msg)) {
      return NextResponse.json({ error: msg, code: 'bad_request' }, { status: 400, headers: CORS })
    }
    return NextResponse.json({ error: `Faucet error: ${msg}`, code: 'faucet_error' }, { status: 503, headers: CORS })
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run app/api/claim/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: POST /api/claim route"
```

---

### Task 15: `GET /api/status/[txid]` route

**Files:**
- Create: `app/api/status/[txid]/route.ts`
- Test: `app/api/status/[txid]/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/api/status/[txid]/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/arcade', () => ({ getTxStatus: vi.fn() }))
vi.mock('@/lib/config', () => ({ getConfig: () => ({ ARCADE_URL: 'http://arcade.test' }), CHAIN: 'test' }))

import { GET } from './route'
import { getTxStatus } from '@/lib/arcade'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/status/[txid]', () => {
  it('returns the status when found', async () => {
    ;(getTxStatus as any).mockResolvedValue({ txid: 'ab', txStatus: 'MINED', blockHeight: 7 })
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ txid: 'ab' }) })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ txid: 'ab', status: 'MINED', blockHeight: 7 })
  })

  it('404 when arcade has no record', async () => {
    ;(getTxStatus as any).mockResolvedValue(null)
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ txid: 'missing' }) })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run "app/api/status/[txid]/route.test.ts"`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement `app/api/status/[txid]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'
import { getTxStatus } from '@/lib/arcade'

export async function GET(_req: Request, { params }: { params: Promise<{ txid: string }> }) {
  const { txid } = await params
  const cfg = getConfig()
  const st = await getTxStatus(cfg.ARCADE_URL, txid)
  if (!st) {
    return NextResponse.json({ error: 'Unknown txid', code: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ txid: st.txid, status: st.txStatus, blockHeight: st.blockHeight ?? null })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run "app/api/status/[txid]/route.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: GET /api/status/[txid] route"
```

---

### Task 16: `GET /api/health` route

**Files:**
- Create: `app/api/health/route.ts`
- Test: `app/api/health/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/api/health/route.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/config', () => ({
  getConfig: () => ({ ARCADE_URL: 'http://arcade.test', ARCADE_CHAINTRACKS_URL: 'http://arcade.test/chaintracks/v2' }),
  CHAIN: 'test',
}))

import { GET } from './route'

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.unstubAllGlobals())

describe('GET /api/health', () => {
  it('reports reachable services', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ height: 1 }) }) as unknown as Response))
    const res = await GET()
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.arcadeReachable).toBe(true)
    expect(json.network).toBe('teratestnet')
  })

  it('reports degraded when chaintracks is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }) as unknown as Response))
    const res = await GET()
    const json = await res.json()
    expect(json.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run app/api/health/route.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement `app/api/health/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/config'

async function reachable(url: string): Promise<boolean> {
  try {
    const r = await fetch(url)
    return r.ok
  } catch {
    return false
  }
}

export async function GET() {
  const cfg = getConfig()
  const [chaintracksOk] = await Promise.all([reachable(`${cfg.ARCADE_CHAINTRACKS_URL}/height`)])
  // arcade /tx requires POST; treat chaintracks reachability as the arcade-stack signal,
  // plus a HEAD-ish GET to the base (a 404 still means the host is up).
  let arcadeReachable = false
  try {
    const r = await fetch(`${cfg.ARCADE_URL}/health`).catch(() => null)
    arcadeReachable = !!r // any response (even non-2xx) means the host answered
  } catch {
    arcadeReachable = false
  }
  const ok = chaintracksOk && arcadeReachable
  return NextResponse.json(
    { ok, network: 'teratestnet', arcadeReachable, chaintracksReachable: chaintracksOk },
    { status: ok ? 200 : 503 },
  )
}
```

> Note: if your arcade build has no `/health`, change the probe to `${cfg.ARCADE_URL}/` and accept any HTTP response as "host up". Confirm in Task 18.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run app/api/health/route.test.ts`
Expected: PASS (2 tests). (The second test's both-fetches-fail makes `ok` false.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: GET /api/health route"
```

---

## Phase 5 — Web UI

### Task 17: Address-claim UI (page + form + Turnstile)

**Files:**
- Create: `app/components/TurnstileWidget.tsx`, `app/components/ClaimForm.tsx`
- Modify: `app/page.tsx`, `app/layout.tsx`, `app/globals.css` (Tailwind is already configured by create-next-app)

This is presentational; verification is manual (`pnpm dev`) plus the API tests above. No unit test step.

- [ ] **Step 1: Implement `app/components/TurnstileWidget.tsx`**

```tsx
'use client'
import Script from 'next/script'
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string }
  }
}

export function TurnstileWidget({ siteKey, onToken }: { siteKey: string; onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const rendered = useRef(false)

  useEffect(() => {
    const tryRender = () => {
      if (rendered.current || !ref.current || !window.turnstile) return
      rendered.current = true
      window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
      })
    }
    tryRender()
    const id = setInterval(tryRender, 300)
    return () => clearInterval(id)
  }, [siteKey, onToken])

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div ref={ref} />
    </>
  )
}
```

- [ ] **Step 2: Implement `app/components/ClaimForm.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { TurnstileWidget } from './TurnstileWidget'

export function ClaimForm({ siteKey }: { siteKey: string }) {
  const [address, setAddress] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ txid: string; ef: string } | null>(null)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, captchaToken: token }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Request failed')
      setResult({ txid: json.txid, ef: json.ef })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Your teratestnet address</span>
        <input
          className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
          placeholder="m… or n…"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          required
        />
      </label>
      <TurnstileWidget siteKey={siteKey} onToken={setToken} />
      <button
        type="submit"
        disabled={busy || !token || !address}
        className="rounded bg-emerald-600 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Claim test coins'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="rounded bg-gray-50 p-3 text-sm">
          <p className="font-medium text-emerald-700">Funds sent!</p>
          <p className="mt-1 break-all">
            txid: <a className="text-blue-600 underline" href={`/api/status/${result.txid}`}>{result.txid}</a>
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer">Extended-format transaction (EF)</summary>
            <textarea readOnly className="mt-1 h-32 w-full font-mono text-xs" value={result.ef} />
          </details>
        </div>
      )}
    </form>
  )
}
```

- [ ] **Step 3: Implement `app/page.tsx`**

```tsx
import { ClaimForm } from './components/ClaimForm'

export default function Home() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-16">
      <header>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">teratestnet</span>
        <h1 className="mt-3 text-3xl font-bold">BSV Teratestnet Faucet</h1>
        <p className="mt-2 text-gray-600">Get teratestnet coins sent to any address. You receive the funding transaction in extended format (EF).</p>
      </header>

      <section className="rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Send to an address</h2>
        <ClaimForm siteKey={siteKey} />
      </section>

      <section className="rounded-lg border border-gray-200 p-6">
        <h2 className="mb-2 text-lg font-semibold">Developer API</h2>
        <pre className="overflow-x-auto rounded bg-gray-900 p-4 text-xs text-gray-100">{`curl -X POST $FAUCET/api/claim \\
  -H 'content-type: application/json' \\
  -d '{"address":"<your-teratestnet-address>"}'
# (public callers also send "captchaToken"; API-key callers send Authorization: Bearer <key>)
# -> { "txid": "...", "ef": "...", "outputs": [...], "network": "teratestnet" }`}</pre>
      </section>
    </main>
  )
}
```

- [ ] **Step 4: Manual verification**

Run: `pnpm dev` (with a valid `.env.local`). Open the page, confirm the Turnstile widget renders and the form is disabled until the token + address are present. (A real claim needs a funded wallet — covered in Task 18.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: address-claim web UI with Turnstile"
```

---

## Phase 6 — End-to-end verification

### Task 18: End-to-end verification against teratestnet

**Files:** none (operational checklist). Requires: a funded `TREASURY_WIF` + `treasury-utxos.json`, a reachable `ARCADE_URL` and `ARCADE_CHAINTRACKS_URL`, and Turnstile keys.

- [ ] **Step 1: Confirm arcade contracts against the live instance**

```bash
# Broadcast route + content-type:
curl -i -X POST "$ARCADE_URL/tx" -H 'content-type: application/json' -d '{"rawTx":"00"}'   # expect 400 (bad tx) not 404
# Status shape:
curl -s "$ARCADE_URL/tx/<any-known-txid>" | jq
# Chaintracks:
curl -s "$ARCADE_CHAINTRACKS_URL/height" | jq
curl -s "$ARCADE_CHAINTRACKS_URL/header/height/1" | jq
```
If any field name/route differs from the assumptions in Tasks 5/6/16, fix those modules and re-run their unit tests. **Do not proceed until these match.**

- [ ] **Step 2: Run the treasury bootstrap**

```bash
# Provide treasury-utxos.json: [{ "txid","vout","satoshis","sourceRawTxHex" }]
pnpm bootstrap
```
Expected: prints the sweep txid, waits for MINED, internalizes each output, prints a non-zero balance. If `internalizeAction` throws `valid AtomicBEEF`, the chaintracks adapter could not confirm the block height — re-check Task 6 against the live `header/height/{h}` for the mined block.

- [ ] **Step 3: Exercise the dev API end-to-end**

```bash
# Generate a teratestnet keypair/address for the test, then:
curl -s -X POST "http://localhost:3000/api/claim" \
  -H 'content-type: application/json' \
  -H 'Authorization: Bearer <test-api-key>' \
  -d '{"address":"<teratestnet-addr>","amount":50000}' | jq
```
Expected: `{ txid, ef, outputs, network:"teratestnet" }`. Then:
```bash
curl -s "http://localhost:3000/api/status/<txid>" | jq   # status advances RECEIVED -> ... -> MINED
```
Verify the returned `ef` parses: in a node REPL, `Transaction.fromHexEF(ef)` (from `@bsv/sdk`) succeeds and its output 0 pays your address for the requested amount.

- [ ] **Step 4: Verify guard behavior**

- Without an API key and without a captcha token → `403`.
- Exceed `RATE_LIMIT_MAX` within the window → `429` with `Retry-After`.
- Re-send with the same `Idempotency-Key` → identical `txid`/`ef`, no second payout (confirm only one `Claim` row).

- [ ] **Step 5: Full test suite + build**

Run: `DATABASE_URL="file:./prisma/dev.db" pnpm test && pnpm build`
Expected: all unit/integration tests pass; production build succeeds.

- [ ] **Step 6: Commit any fixes from live verification**

```bash
git add -A && git commit -m "fix: align arcade integration with live teratestnet contracts"
```

---

## Out of scope (this plan)

Deferred to **Plan 2 (BRC-100 wallet onboarding)**: the `/api/claim/wallet` endpoint, BRC-29 payment to a connected wallet's identity key, returning Atomic BEEF + remittance, and the client-side `WalletClient`/`internalizeAction` handoff — gated on confirming a teratestnet-capable consumer wallet and validating the user-side SPV path. Also out of scope here: admin dashboard, multi-network switching, automated treasury refill, background proof completion (the `Monitor`), and full BRC-31 auth.
