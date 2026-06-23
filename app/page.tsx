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
