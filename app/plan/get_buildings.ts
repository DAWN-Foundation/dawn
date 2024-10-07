import * as anchor from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import { getFlag, getIDL, getWallet, submitTx } from './utils'

async function main() {
  const owner = getFlag('--owner')

  const wallet = getWallet()
  console.log({ signer: wallet.payer.publicKey.toBase58() })

  const connection = new Connection('http://127.0.0.1:8899')
  const provider = new anchor.AnchorProvider(connection, wallet)
  anchor.setProvider(provider)
  const idl = getIDL()
  const program = new anchor.Program<Plan>(idl as Plan, provider)

  console.log({ PROGRAM_ID: program.programId.toBase58() })

  let filters = []
  if (owner) {
    filters = [
      {
        memcmp: {
          offset: 8,
          bytes: owner,
        },
      },
    ]
  }

  const buildings = await program.account.building.all(filters)

  console.log(
    buildings.map((b) => ({
      owner: b.publicKey.toBase58(),
      account: { ...b.account, owner: b.account.owner.toBase58() },
    })),
  )
}

main().catch(console.error)
