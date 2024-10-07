import * as anchor from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import { getFlag, getIDL, getWallet, submitTx } from './utils'

// CONSTANTS
const NAME = 'Building 1'
const ADDRESS = '123 Main St'
const FLOORS = 5

async function main() {
  const name = getFlag('--name') || NAME
  const address = getFlag('--address') || ADDRESS
  const floors = parseInt(getFlag('--floors')) || FLOORS

  const wallet = getWallet()
  console.log({ signer: wallet.payer.publicKey.toBase58() })

  const connection = new Connection('http://127.0.0.1:8899')
  const provider = new anchor.AnchorProvider(connection, wallet)
  anchor.setProvider(provider)
  const idl = getIDL()
  const program = new anchor.Program<Plan>(idl as Plan, provider)

  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [buildingPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('building'),
      Buffer.from(name),
      Buffer.from(address),
      Buffer.from([floors]),
    ],
    program.programId,
  )

  console.log({ buildingPda: buildingPda.toBase58() })

  const itx = await program.methods
    .addBuilding(name, address, floors)
    .accounts({
      caller: wallet.payer.publicKey,
      building: new PublicKey(buildingPda),
    })
    .instruction()

  const txResult = await submitTx(connection, wallet, itx).catch(console.error)
  console.log('Tx submitted', { txResult })
}

main().catch(console.error)
