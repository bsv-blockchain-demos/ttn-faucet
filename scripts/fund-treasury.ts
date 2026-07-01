import 'dotenv/config'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { PrivateKey, P2PKH, Transaction, MerklePath, SatoshisPerKilobyte, LockingScript } from '@bsv/sdk'
import { getConfig } from '../lib/config'
import { deriveBrc29, newDerivationValues } from '../lib/brc29'
import { broadcastRawTx, getTxStatus } from '../lib/arcade'
import { getWallet } from '../lib/wallet'

// Resumable treasury funding: persists a receipt BEFORE broadcasting so the broadcast and
// the internalize are decoupled and recoverable. Re-run to resume (re-broadcast is idempotent,
// internalized outputs are skipped).
const RECEIPT = process.env.FUND_RECEIPT_FILE ?? './data/fund-receipt.json'
const POLL_TIMEOUT_MS = Number(process.env.FUND_POLL_TIMEOUT_MS ?? String(40 * 60_000))
const FEE_RATE = Number(process.env.FUND_FEE_RATE ?? '1000') // sat/kB (~1 sat/byte) — negligible vs 50 BSV
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

interface OutRec {
  outputIndex: number
  derivationPrefix: string
  derivationSuffix: string
  satoshis: number
  internalized?: boolean
}
interface Receipt {
  sweepTxid: string
  sweepRawHex: string
  sweepEfHex: string
  walletIdentityKey: string
  senderIdentityKey: string
  feeRate: number
  outputs: OutRec[]
}

async function buildSweep(cfg: any, walletIdentityKey: string): Promise<Receipt> {
  const flatKey = PrivateKey.fromWif(cfg.TREASURY_WIF)
  const senderIdentityKey = flatKey.toPublicKey().toString()
  const seed: any[] = JSON.parse(readFileSync(process.env.TREASURY_UTXOS_FILE ?? './treasury-utxos.json', 'utf8'))
  const totalIn = seed.reduce((s: number, u: any) => s + u.satoshis, 0)

  const tx = new Transaction()
  for (const u of seed) {
    tx.addInput({
      sourceTransaction: Transaction.fromHex(u.sourceRawTxHex),
      sourceOutputIndex: u.vout,
      unlockingScriptTemplate: new P2PKH().unlock(flatKey),
    })
  }
  const estFee = 5000
  const perOutput = Math.floor((totalIn - estFee) / cfg.BOOTSTRAP_SPLIT_COUNT)
  if (perOutput < 1000) throw new Error('treasury too small for the requested split count')

  const outputs: OutRec[] = []
  for (let i = 0; i < cfg.BOOTSTRAP_SPLIT_COUNT; i++) {
    const { derivationPrefix, derivationSuffix } = newDerivationValues()
    const { lockingScriptHex } = deriveBrc29({
      recipientIdentityKeyHex: walletIdentityKey,
      senderPrivateKey: flatKey,
      derivationPrefix,
      derivationSuffix,
    })
    tx.addOutput({ lockingScript: LockingScript.fromHex(lockingScriptHex), satoshis: perOutput })
    outputs.push({ outputIndex: i, derivationPrefix, derivationSuffix, satoshis: perOutput })
  }
  tx.addOutput({ lockingScript: new P2PKH().lock(flatKey.toAddress('testnet')), change: true })

  await tx.fee(new SatoshisPerKilobyte(FEE_RATE))
  await tx.sign()
  return {
    sweepTxid: tx.id('hex'),
    sweepRawHex: tx.toHex(),
    sweepEfHex: tx.toHexEF(), // arcade-v2 POST /tx requires extended format
    walletIdentityKey,
    senderIdentityKey,
    feeRate: FEE_RATE,
    outputs,
  }
}

async function main() {
  const cfg = getConfig()
  const { wallet, identityKey } = await getWallet()
  mkdirSync('./data', { recursive: true })

  let receipt: Receipt
  if (existsSync(RECEIPT)) {
    receipt = JSON.parse(readFileSync(RECEIPT, 'utf8'))
    if (receipt.walletIdentityKey !== identityKey) {
      throw new Error('Receipt wallet identity != current WALLET_ROOT_KEY_HEX — refusing to continue.')
    }
    console.log('Resuming from receipt; sweep txid', receipt.sweepTxid)
  } else {
    receipt = await buildSweep(cfg, identityKey)
    writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2))
    console.log('Receipt saved BEFORE broadcast at', RECEIPT)
    console.log('Sweep txid:', receipt.sweepTxid, '| outputs:', receipt.outputs.length, '| per-output sats:', receipt.outputs[0]?.satoshis)
  }

  // Broadcast (idempotent: arcade returns "already submitted" if it already has it)
  let st = await getTxStatus(cfg.ARCADE_URL, receipt.sweepTxid)
  if (!st || st.txStatus !== 'MINED') {
    const b = await broadcastRawTx(cfg.ARCADE_URL, receipt.sweepEfHex)
    console.log('Broadcast response:', JSON.stringify(b.raw))
    if (!b.ok && !b.alreadyKnown) throw new Error('Broadcast rejected: ' + JSON.stringify(b.raw))
    console.log('Broadcast accepted.')
  }

  // Poll for MINED + merkle proof
  const start = Date.now()
  let merklePathHex: string | undefined
  for (;;) {
    st = await getTxStatus(cfg.ARCADE_URL, receipt.sweepTxid)
    if (st?.txStatus === 'MINED' && st.merklePath) {
      merklePathHex = st.merklePath
      break
    }
    if (st?.txStatus === 'REJECTED' || st?.txStatus === 'DOUBLE_SPEND_ATTEMPTED') {
      throw new Error('Sweep failed on network: ' + st.txStatus)
    }
    if (Date.now() - start > POLL_TIMEOUT_MS) {
      console.log('Timed out waiting for MINED (status=' + (st?.txStatus ?? 'unknown') + '). Re-run to resume.')
      process.exit(2)
    }
    console.log('  status:', st?.txStatus ?? 'unknown', '— waiting 20s for mining...')
    await sleep(20_000)
  }
  console.log('Sweep MINED with merkle proof. Internalizing...')

  // Attach proof, internalize all not-yet-done outputs in one call
  const tx = Transaction.fromHex(receipt.sweepRawHex)
  tx.merklePath = MerklePath.fromHex(merklePathHex)
  const atomicBEEF = tx.toAtomicBEEF()

  const pending = receipt.outputs.filter((o) => !o.internalized)
  if (pending.length) {
    await wallet.internalizeAction({
      tx: atomicBEEF,
      description: 'treasury bootstrap sweep',
      labels: ['bootstrap'],
      outputs: pending.map((o) => ({
        outputIndex: o.outputIndex,
        protocol: 'wallet payment' as const,
        paymentRemittance: {
          derivationPrefix: o.derivationPrefix,
          derivationSuffix: o.derivationSuffix,
          senderIdentityKey: receipt.senderIdentityKey,
        },
      })),
    })
    receipt.outputs.forEach((o) => (o.internalized = true))
    writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2))
    console.log('Internalized', pending.length, 'outputs.')
  }

  const outs: any = await wallet.listOutputs({ basket: 'default', limit: 1000 })
  const total = (outs.outputs ?? []).reduce((s: number, x: any) => s + (x.satoshis ?? 0), 0)
  console.log('DONE. default basket:', outs.totalOutputs ?? outs.outputs?.length, 'outputs,', total, 'sats spendable.')
  process.exit(0)
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})
