import { Keypair, PublicKey } from '@solana/web3.js'
import { utils as anchorUtils } from '@coral-xyz/anchor'
import fs from 'fs'

import { connect, getMock, getFlag } from '../../shared/cli-utils'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

async function main() {
  const keypairPath = getFlag('--keypair')
  if (!keypairPath) {
    throw new Error('--keypair is required')
  }
  const keypairRaw = fs.readFileSync(keypairPath, 'utf8')
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairRaw)))
  const secretKeyHex = Buffer.from(keypair.secretKey).toString('hex')
  const secretKeyBase58 = anchorUtils.bytes.bs58.encode(keypair.secretKey)
  console.log({ secretKeyHex, secretKeyBase58 })

  //
}

main().catch(console.error)
