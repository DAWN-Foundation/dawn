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

  // const [buildingPda] = PublicKey.findProgramAddressSync(
  //   [
  //     Buffer.from('building'),
  //     Buffer.from(name),
  //     Buffer.from(address),
  //     Buffer.from([floors]),
  //   ],
  //   program.programId,
  // )
  // console.log({ buildingPda: buildingPda.toBase58() })

  const buildings = await program.account.building.all()

  console.log(buildings)
}

main().catch(console.error)
