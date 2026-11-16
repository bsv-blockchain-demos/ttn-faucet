import http from 'node:http'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { WalletRelayService } from '@bsv/wallet-relay'
import { parseConfig } from './config.js'
import { createRequestHandler } from './server.js'
import { notifyConnected } from './notify.js'

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
  onSessionConnected: (sessionId) => {
    console.log(`[relay] mobile wallet paired session=${sessionId}`)
    if (cfg.FAUCET_INTERNAL_URL) {
      void notifyConnected(cfg.FAUCET_INTERNAL_URL, sessionId).then((ok) => {
        if (!ok) console.log(`[relay] could not notify the faucet of session=${sessionId}`)
      })
    }
  },
  onSessionDisconnected: (sessionId) => console.log(`[relay] mobile wallet disconnected session=${sessionId}`),
  // Who closed each socket and how: cause client|heartbeat|server, code 1006 = abnormal drop.
  onSocketClosed: (info) =>
    console.log(
      `[relay] socket closed session=${info.topic} role=${info.role} cause=${info.cause} code=${info.code}` +
        ` reason=${JSON.stringify(info.reason)} connectedForMs=${info.connectedForMs} missedPongs=${info.missedPongs}`,
    ),
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
