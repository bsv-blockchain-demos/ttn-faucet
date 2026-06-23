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

  const tx = new Transaction()
  for (const u of seedUtxos) {
    tx.addInput({
      sourceTransaction: Transaction.fromHex(u.sourceRawTxHex),
      sourceOutputIndex: u.vout,
      unlockingScriptTemplate: new P2PKH().unlock(flatKey),
    })
  }

  // Rough estimator for the dust-guard below; the actual fee is set by SatoshisPerKilobyte at tx.fee().
  const estimatedFee = 1000
  const perOutput = Math.floor((totalIn - estimatedFee) / cfg.BOOTSTRAP_SPLIT_COUNT)
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
  tx.addOutput({ lockingScript: new P2PKH().lock(flatKey.toAddress('testnet')), change: true })

  await tx.fee(new SatoshisPerKilobyte(1))
  await tx.sign()
  const txid = tx.id('hex')
  console.log('Sweep txid:', txid)

  const b = await broadcastRawTx(cfg.ARCADE_URL, tx.toHex())
  if (!b.ok) throw new Error(`broadcast failed: ${JSON.stringify(b.raw)}`)
  console.log('Broadcast accepted. Waiting for it to be mined + proven by arcade...')

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

  const outputs = await wallet.listOutputs({ basket: 'default', limit: 1000 })
  console.log(`Bootstrap complete. Wallet tracks ${outputs.totalOutputs ?? outputs.outputs?.length ?? '?'} outputs in 'default'.`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
