# Teratestnet Faucet — UX/UI Overhaul Handover

> **Purpose of this doc:** a complete, self-contained brief for a UX/UI redesign. It maps every
> screen, pathway, component, state, design token, and constraint of the *current* app so the
> redesign can change the surface freely without breaking the engine underneath.
>
> **Golden rule:** This is a **cosmetic/UX overhaul**. The API data contracts, the wallet handshake,
> and the captcha gating (§9) are load-bearing — restyle them, don't rewire them.

---

## 1. What this product is

A faucet that dispenses free **teratestnet** (BSV Teranode scaling testnet) coins to developers.
There are **three ways to get coins**, but only two have UI:

| Pathway | UI surface | What the user does | What they get back |
|---|---|---|---|
| **BRC-100 wallet (1-click)** | "Wallet · 1-click" tab | Click once; their browser wallet is detected & paid directly | Coins land as **spendable** balance (Atomic BEEF, no mining wait) |
| **Paste address** | "Paste address" tab | Paste (or generate) a teratestnet address, solve captcha, claim | A broadcast tx + copyable **extended-format (EF)** hex |
| **Dev API** (no UI) | Shown, not interactive | `curl`/`fetch` `POST /api/claim` from scripts/CI | JSON `{ txid, ef, ... }` |

Default payout: **100,000 sats** per claim (`FAUCET_PAYOUT_SATS`). Abuse control: Cloudflare Turnstile
captcha + per-subject rate limiting (rate limiting currently **disabled** via env). Optional API key
bypasses captcha and raises limits.

The full product spec lives at `docs/superpowers/specs/2026-06-23-teratestnet-faucet-design.md`.

---

## 2. Tech stack & UI framework (constraints)

| Concern | Reality | Note for redesign |
|---|---|---|
| Framework | **Next.js 16.2.9, App Router** | This is a *modified* Next — see `AGENTS.md`. Read `node_modules/next/dist/docs/` before changing routing/rendering. |
| React | **19.2.4** | Server Components by default; interactive UI is `'use client'`. |
| Styling | **Tailwind CSS v4** via `@tailwindcss/postcss`, tokens declared in CSS `@theme` | No `tailwind.config.js`; theme is in `app/globals.css`. |
| Component lib | **None.** UI is hand-rolled Tailwind utility classes | ⚠️ The spec said "shadcn/Tailwind" but **shadcn was never installed** (no `components.json`, no Radix/CVA/lucide). Adopting shadcn now = a from-scratch component build. The `vercel:shadcn` skill is available if you go that route. |
| Fonts | **Geist Sans** + **Geist Mono** (`next/font/google`), CSS vars `--font-geist-sans` / `--font-geist-mono` | Mono is used heavily for "developer/terminal" texture. |
| Icons | **Emoji** (🔥 🖥️ 🪐 ✓ ⚠ ⧉ →) + inline CSS dots | No icon library. A real icon set is an obvious upgrade. |
| Captcha | **Cloudflare Turnstile** widget (external script, renders its own iframe) | Limited visual control over the widget itself; you control its placement/container only. |
| Theme | **Dark-only.** Fixed `#070a14` canvas, `themeColor` meta = `#070a14` | No light mode exists. |
| Build | `output: "standalone"`; BSV/knex/sqlite marked `serverExternalPackages` | Backend-only concern; irrelevant to UI. |
| Assets | `public/` holds only default Next SVGs (`file/globe/next/vercel/window.svg`) | **No real branding, favicon, or OG image.** `app/favicon.ico` is the Next default. |

---

## 3. Current design system / tokens

All tokens are in **`app/globals.css`** (Tailwind v4 `@theme inline`). The redesign will most likely
start here.

### Color tokens
| Token | Value | Role |
|---|---|---|
| `--background` | `#070a14` | App canvas (navy-black), always dark |
| `--foreground` | `#e7eaf3` | Base text |
| `brand-400 / 500 / 600` | `#6b82ff` / `#4f6bff` / `#3d54e0` | Indigo-blue — CTAs, highlighted words, active tab |
| `accent-400 / 500` | `#34d399` / `#10b981` | Green — "live/online" status, success states |
| `surface` | `#0d1322` | Card/panel background |
| `surface-raised` | `#131a2c` | (declared, lightly used) |

**Semantic colors used inline (not tokenized):** `red-400` (errors), `amber-300/400` (warnings),
the macOS traffic-light dots `#ff5f56 / #ffbd2e / #27c93f` in terminal chrome.

### The signature background
`body` paints **two radial glows over the navy base** (top-left blue `rgba(79,107,255,.20)`,
top-right cyan `rgba(56,189,248,.12)`), `background-attachment: fixed`. This glow is the app's main
visual identity — keep or deliberately replace it.

### Texture & hierarchy
- **Opacity-driven hierarchy:** text uses `white/80 → /70 → /60 → /55 → /45 → /40 → /35 → /25`.
  Borders use `white/10`, `white/5`, `white/15`. This is the single most pervasive pattern in the UI.
  ⚠️ Lowest tiers (`white/35`, `white/25`) on the dark bg are **borderline for WCAG contrast** — audit on redesign.
- **Radii:** `rounded-lg` (inputs/buttons-sm), `rounded-xl` (primary buttons/tabs), `rounded-2xl` (cards), `rounded-full` (pills/dots).
- **Shadows:** brand CTA glow `0 8px 30px rgba(79,107,255,.35)`; card lift `0 30px 80px -20px rgba(0,0,0,.7)`; logo `0 4px 16px rgba(79,107,255,.5)`.
- **Custom scrollbar** `.scrollbar-faint` (8px, `white/12` thumb) for code/terminal blocks.

### Layout widths
- Header & footer: `max-w-5xl`
- Main content column: `max-w-3xl` (narrow, single-column, reading-oriented)
- Single responsive breakpoint in play: **`sm:`** (640px). Everything is mobile-first single-column,
  widening at `sm:`. No `md/lg/xl` usage — desktop ≈ a centered narrow column.

---

## 4. Sitemap

There is **one HTML screen.** Everything is on `/`. The rest are JSON API routes.

```
/                         ← the entire app (single scrolling page)
│
├─ POST /api/claim        ← paste-address flow → { txid, ef, outputs, network }
├─ POST /api/claim/wallet ← BRC-100 flow → { txid, atomicBEEF, derivation*, outputIndex, amount }
├─ GET  /api/status/:txid ← arcade proxy → { txid, status, blockHeight }  (JSON, no UI)
├─ GET  /api/balance      ← treasury balance → { balanceSats, network }   (polled by UI)
└─ GET  /api/health       ← { ok, network, arcadeReachable, chaintracksReachable }
```

⚠️ **No status screen exists.** Success states link the user to `/api/status/{txid}`, which renders
**raw JSON in the browser**. A real "track your transaction" view is a prime overhaul candidate.

---

## 5. Page anatomy (`app/page.tsx`, top → bottom)

The page is a server component that reads `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `FAUCET_PAYOUT_SATS`
from env and passes them down as props.

1. **Sticky header** (`max-w-5xl`) — Logo (a `B` glyph in a brand square + "BSV Teranode / TESTNET FAUCET"), nav links: **Dev API** (anchor `#api`), **Explorer** (`#` — dead), **GitHub** (outbound).
2. **Hero** (`max-w-3xl`) — ⚠️ **unusual order**: the interactive **FaucetCard comes first**, *then* below it the marketing: a "● NETWORK ONLINE · teratestnet" pill, the H1 *"Free test coins to build on the **million-TPS** network."*, a sub-paragraph, and a 3-stat inline list (100,000 sats / ~0s / BRC-100).
3. **StatsGrid** — 4 stat cards (see §7.5).
4. **"Why bother with teratestnet coins?"** — H2 + 3 numbered feature cards (`01/02/03`).
5. **API section** (`#api`) — "FOR SCRIPTS & CI" badge, H2 *"Or just hit the API."*, the ApiTerminal.
6. **Footer** (`max-w-5xl`) — wordmark + tagline ("for development & testing only") + links (Docs, Explorer[#], GitHub, BSV Blockchain).

---

## 6. The FaucetCard — the heart of the UI

`app/components/FaucetCard.tsx` — terminal-styled card (`rounded-2xl`, window chrome with a green
dot + `faucet.teratestnet` + a `v1 · live` pill). Contains a **2-tab switcher**:

- **Tab A — "Wallet · 1-click"** (default active). Shows a 3-up grid of supported wallets
  (BSV Browser 🔥 / BSV Desktop 🖥️ / Metanet 🪐 — **emoji**), then renders `WalletPanel`.
- **Tab B — "Paste address"**. Renders `AddressPanel`.

Active tab = solid `brand-500` fill; inactive = `white/60` text. This card is where ~all user
interaction happens.

---

## 7. User pathways & every UI state

### 7.1 Wallet 1-click flow (`WalletClaim.tsx` → `WalletPanel`)
A state machine. **Phases:** `detecting → unavailable | idle → claiming → success | error`.

| Phase | What renders |
|---|---|
| `detecting` | Pulsing brand dot + "Looking for a BRC-100 wallet…" (probes `WalletClient('auto').getVersion()` with a 1.5s timeout) |
| `unavailable` | "No BRC-100 wallet detected…" + **"Paste an address instead →"** button (switches to Tab B) |
| `idle` | Explainer copy → optional **network-mismatch warning** (amber, if wallet reports `mainnet`) → Turnstile → primary CTA **"Connect wallet & claim {N} sats →"** (disabled until captcha token) → microcopy |
| `claiming` | Same CTA, label flips to "Connecting…", disabled |
| `success` | Green ✓ badge "Funds in your wallet!" + "{amount} sats are now spendable" + txid link (→ raw JSON) |
| `error` | Red error text under the CTA |

Mechanics (preserve): on claim it reads `getPublicKey({identityKey:true})`, POSTs to `/api/claim/wallet`,
then **client-side** calls `wallet.internalizeAction(...)` with the returned Atomic BEEF + remittance.

### 7.2 Paste-address flow (`ClaimForm.tsx` → `AddressPanel`)
| Element | Behavior |
|---|---|
| Address input | mono font; placeholder `m… or n…`; required |
| **"Generate a test key"** link | Calls `lib/keygen.generateTestnetKey()` **in-browser** (key never leaves client). Auto-fills the address and reveals a dashed box showing **address + WIF**, both **copy-on-click** (non-obvious affordance), with an amber "testing only" warning |
| Turnstile | required; gates the button |
| Primary CTA | "Claim {N} sats" / "Sending…"; disabled until `token && address` |
| `error` | red text |
| `result` | Green "Funds sent!" + txid link + a `<details>` collapsible **EF textarea** (read-only, mono) |

### 7.3 Captcha (`TurnstileWidget.tsx`)
Injects the Cloudflare Turnstile script, renders the widget into a div, and calls back with a token.
The token is **required to enable both claim buttons.** Server also re-verifies. Used in both panels.

### 7.4 Dev API showcase (`ApiTerminal.tsx`)
Non-interactive marketing/devrel: endpoint chips (`POST /api/claim`, `POST /api/claim/wallet`,
`GET /api/status/:txid`), a terminal card (traffic-light dots + `claim.sh` + **Copy** button) with a
`curl` example, and a note about the `Authorization: Bearer` header. ⚠️ The curl example hardcodes
`https://faucet.teratestnet.org` (aspirational domain).

### 7.5 StatsGrid (`StatsGrid.tsx` + `FaucetBalance.tsx`)
4 cards in a 1-col → `sm:`2-col grid:

| Card | Source | ⚠️ |
|---|---|---|
| Sats dispensed — "184,320,000" | **hardcoded fake** | placeholder |
| Claims today — "1,287" | **hardcoded fake** | placeholder |
| Treasury balance | **LIVE** — `useFaucetBalanceSats()` polls `/api/balance` every 30s | real (`…` loading, `n/a` if down) |
| Network throughput — "1.04M tps" | **hardcoded fake** | placeholder |

3 of 4 "metrics" are decorative marketing numbers. The redesign should decide which to make real,
which to drop, and how to label the rest honestly.

---

## 8. Component inventory

| File | Boundary | Responsibility | Key props / state |
|---|---|---|---|
| `app/layout.tsx` | server | Html shell, Geist fonts, metadata/OG, themeColor | — |
| `app/page.tsx` | server | Full page composition; reads env → props | `siteKey`, `payoutSats` |
| `components/FaucetCard.tsx` | client | Tab switcher + wallet logos + window chrome | `tab: 'wallet'|'address'` |
| `components/WalletClaim.tsx` | client | BRC-100 1-click state machine | `phase`, `token`, `result`, `networkWarning` |
| `components/ClaimForm.tsx` | client | Paste-address form + key generator | `address`, `token`, `busy`, `result`, `generated`, `error` |
| `components/TurnstileWidget.tsx` | client | Cloudflare captcha mount | `siteKey`, `onToken` |
| `components/ApiTerminal.tsx` | client | Dev-API showcase + copy | `copied` |
| `components/StatsGrid.tsx` | client | 4 stat cards (1 live, 3 fake) | — |
| `components/FaucetBalance.tsx` | client (hook) | `useFaucetBalanceSats()` polling hook | `sats: number|null|undefined` |

Naming gotcha for the redesign: **`ClaimForm.tsx` exports `AddressPanel`** and **`WalletClaim.tsx`
exports `WalletPanel`** (filenames ≠ export names).

---

## 9. Constraints the redesign MUST preserve

1. **API request/response shapes** (§4 and the spec §5). A cosmetic overhaul must keep sending the
   same bodies and reading the same fields.
2. **Captcha gates submission** and is server-verified. Both CTAs stay disabled until a Turnstile
   token exists. Don't remove the widget or the disabled-state logic.
3. **Wallet detection sequence** and its phases (detecting/unavailable/idle/claiming/success/error),
   including the `unavailable → switch to paste tab` escape hatch.
4. **Client-side `internalizeAction` handoff** after `/api/claim/wallet` returns — this is what makes
   coins spendable; it lives in the browser component.
5. **Env-driven values:** `siteKey` and `payoutSats` flow server→client as props. Display logic that
   formats `payoutSats` (sats and ~tBSV) should stay data-driven, not hardcoded.
6. **`'use client'` boundaries:** everything interactive is a client component; `page.tsx`/`layout.tsx`
   stay server components (they read server env).

---

## 10. Known gaps & overhaul opportunities

- **Fake metrics:** 3/4 StatsGrid numbers are hardcoded; the hero's "~0s / BRC-100 / 100,000" trio is fine but static.
- **Dead/aspirational links:** Explorer = `#` (no teratestnet explorer known yet); curl example uses `faucet.teratestnet.org` which may not be the deploy domain.
- **No transaction-status UI:** txid links dump raw JSON from `/api/status/:txid`. A real status/tracking view (RECEIVED → … → MINED lifecycle from the spec) is missing.
- **Emoji as brand/UI icons:** wallet logos and status glyphs are emoji — inconsistent across platforms.
- **No real brand assets:** default Next favicon/SVGs; no OG image; the `B` logo is a CSS glyph.
- **Inverted hero order:** the form card sits above the headline/value-prop — reconsider the narrative flow.
- **Accessibility:** very low-opacity text tiers risk failing contrast; copy-on-click WIF/address buttons are non-obvious; emoji are `aria-hidden` (good) but carry meaning visually; no visible focus-ring customization beyond `focus:border-brand-500` on the address input.
- **Single breakpoint:** only `sm:` is used — no tablet/large-desktop treatment; wide screens show a narrow centered column with lots of empty gutter.
- **No toasts / no recent-claims feed:** the spec called for a "Funds in your wallet" toast and an anonymized recent-claims list — neither was built (success is inline; no feed).
- **Not shadcn:** despite the spec, components are bespoke Tailwind — decide whether to migrate or keep bespoke.

---

## 11. How to see it running

```bash
pnpm dev            # http://localhost:3000  (.env already created for local UI dev)
```
- The **UI renders fully** without backend infra. Toggle both tabs to exercise every panel.
- Wallet tab will land on **"unavailable"** unless a BRC-100 wallet is installed in the browser.
- Claim submissions will error (no arcade/treasury locally) — that's expected; the redesign is about
  the surface, and all **layouts, states, and styles are reachable** by triggering them
  (e.g. submit to see error styling; the success/result blocks can be exercised with a wallet + real infra).

---

## 12. Reference files (read these in order)

1. `app/globals.css` — design tokens (start here)
2. `app/page.tsx` — page composition & content/copy
3. `app/components/FaucetCard.tsx` — the tab shell
4. `app/components/WalletClaim.tsx` + `ClaimForm.tsx` — the two flows & all states
5. `app/components/StatsGrid.tsx`, `ApiTerminal.tsx`, `TurnstileWidget.tsx` — supporting UI
6. `docs/superpowers/specs/2026-06-23-teratestnet-faucet-design.md` — original product intent (§6 = UI intent, §10 = out of scope)
</content>
</invoke>
