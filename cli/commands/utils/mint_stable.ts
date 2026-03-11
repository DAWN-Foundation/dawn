import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
const { mintTo } = require('@solana/spl-token')

import { connect, getMock, getFlag } from '../../shared/cli-utils'
import { USD_DECIMALS } from '../../../sdk/utils'
import {
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token'

const AMOUNT = 1000

async function main() {
  const amount = parseInt(getFlag('--amount')) || AMOUNT
  const recipientParam = getFlag('--recipient')
  if (!recipientParam) {
    throw new Error('--recipient is required')
  }

  const recipient = new PublicKey(recipientParam)

  const mintAmount = new BN(amount).mul(USD_DECIMALS)

  const { wallet, connection } = await connect()
  const mock = getMock()

  const stableMint = new PublicKey(mock.stableMint)
  const { address: recipientTokenAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      stableMint,
      recipient,
      false,
    )
  console.log({
    recipientTokenAccount: recipientTokenAccount.toBase58(),
  })

  const tx = await mintTo(
    connection,
    wallet.payer,
    stableMint,
    recipientTokenAccount,
    wallet.publicKey,
    mintAmount,
  )
  console.log(`Minted ${amount} USD.tel to ${recipient}`, { tx })
}

main().catch(console.error)
