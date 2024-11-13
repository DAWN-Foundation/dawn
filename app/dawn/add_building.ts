import * as anchor from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import { connect, getFlag, getIDL, getWallet, submitTx } from './utils'

// CONSTANTS
const NAME = 'Building 1'
const ADDRESS = '123 Main St'
const FLOORS = 5

async function main() {
  const name = getFlag('--name') || NAME
  const address = getFlag('--address') || ADDRESS
  const floors = parseInt(getFlag('--floors')) || FLOORS

  const { wallet, connection, program } = await connect()
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
      building: buildingPda,
    })
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
