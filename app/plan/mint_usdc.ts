import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'
const { mintTo } = require('@solana/spl-token')

import { Plan } from '../../target/types/plan'
import {
  connect,
  getConfig,
  getFlag,
  getIDL,
  getPlanPda,
  getWallet,
  submitTx,
} from './utils'

const USDC_DECIMALS = new BN(10).pow(new BN(6))

const AMOUNT = 1000

async function main() {
  const amount = parseInt(getFlag('--amount')) || AMOUNT
  const recipient = getFlag('--recipient')
  if (!recipient) {
    throw new Error('--recipient is required')
  }

  const mintAmount = new BN(amount).mul(USDC_DECIMALS)

  const { wallet, connection, program } = await connect()
  const config = getConfig()

  const usdcMint = new PublicKey(config.usdcMint)

  const tx = await mintTo(
    connection,
    wallet.payer,
    usdcMint,
    new PublicKey(recipient),
    wallet.publicKey,
    mintAmount,
  )
  console.log(`Minted ${amount} USDC to ${recipient}`, { tx })
}

main().catch(console.error)
