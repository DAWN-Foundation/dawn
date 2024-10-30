import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'
const { mintTo } = require('@solana/spl-token')

import { connect, getMock, getFlag } from './utils'

const USDC_DECIMALS = new BN(10).pow(new BN(6))

const AMOUNT = 1000

async function main() {
  const amount = parseInt(getFlag('--amount')) || AMOUNT
  const recipient = getFlag('--recipient')
  if (!recipient) {
    throw new Error('--recipient is required')
  }

  const mintAmount = new BN(amount).mul(USDC_DECIMALS)

  const { wallet, connection } = await connect()
  const mock = getMock()

  const usdcMint = new PublicKey(mock.usdcMint)

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
