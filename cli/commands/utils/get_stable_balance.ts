import { PublicKey } from '@solana/web3.js'

import { connect, getMock, getFlag } from '../../shared/cli-utils'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'

async function main() {
  const address = getFlag('--address')
  if (!address) {
    throw new Error('--address is required')
  }

  const { connection } = await connect()
  const mock = getMock()

  const stableMint = new PublicKey(mock.stableMint)
  const tokenAccount = getAssociatedTokenAddressSync(
    stableMint,
    new PublicKey(address),
  )

  const balance = await connection.getTokenAccountBalance(tokenAccount)
  console.log(`USD.tel balance for ${address}`, {
    balance: balance.value.uiAmount,
  })
}

main().catch(console.error)
