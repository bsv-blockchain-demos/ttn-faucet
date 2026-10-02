import http from 'node:http'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { WalletRelayService } from '@bsv/wallet-relay'
import { parseConfig } from './config.js'
import { createRequestHandler } from './server.js'

const cfg = parseConfig(process.env)

const server = http.createServer()

// Attaches the WebSocket relay at /ws on this server (phone + desktop sockets).
const relay = new WalletRelayService({
  server,
  wallet: new ProtoWallet(PrivateKey.fromHex(cfg.RELAY_PRIVATE_KEY)),
  origin: cfg.FAUCET_PUBLIC_URL,
  relayUrl: cfg.RELAY_WS_URL,
  allowedOrigins: [cfg.FAUCET_PUBLIC_URL],
  schema: cfg.QR_SCHEMA,
  onSessionConnected: (sessionId) => console.log(`[relay] mobile wallet paired session=${sessionId}`),
  onSessionDisconnected: (sessionId) => console.log(`[relay] mobile wallet disconnected session=${sessionId}`),
})

const handle = createRequestHandler(relay, cfg.FAUCET_PUBLIC_URL)
server.on('request', (req, res) => void handle(req, res))

server.listen(cfg.PORT, '0.0.0.0', () => {
  console.log(
    `[relay] listening on :${cfg.PORT} origin=${cfg.FAUCET_PUBLIC_URL} ws=${cfg.RELAY_WS_URL}/ws schema=${cfg.QR_SCHEMA}`,
  )
})

function shutdown() {
  relay.stop()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
