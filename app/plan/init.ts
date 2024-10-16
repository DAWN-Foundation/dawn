import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

import { connect, getConfig, submitTx } from './utils'

// CONSTANTS
const DAWN_FEE = new BN(200) // 2% fee (dawn_fee)
const ANDRENA_FEE = new BN(500) // 5% fee (andrena_fee)
const ANDRENA_DAWN_RATIO = new BN(9000) // 90% fee (andrena_dawn_ratio)
const BUILDING_OWNER_DAWN_RATIO = new BN(8000) // 80% fee (bo_dawn_ratio)
const BUILDING_OWNER_ESCROW_RATIO = new BN(2000) // 20% fee (bo_escrow_ratio)

async function main() {
  const { wallet, connection, program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const config = getConfig()

  // const itx = await program.methods
  //   .initialize(
  //     DAWN_FEE,
  //     ANDRENA_FEE,
  //     ANDRENA_DAWN_RATIO,
  //     BUILDING_OWNER_DAWN_RATIO,
  //     BUILDING_OWNER_ESCROW_RATIO,
  //   )
  //   .accounts({
  //     caller: wallet.payer.publicKey,
  //     usdcMint: new PublicKey(config.usdcMint),
  //     dawnMint: new PublicKey(config.dawnMint),
  //     andrenaUsdcAccount: new PublicKey(config.andrenaUsdcAccount),
  //     andrenaDawnAccount: new PublicKey(config.andrenaDawnAccount),
  //     dawnUsdcAccount: new PublicKey(config.dawnUsdcAccount),
  //   })
  //   .instruction()

  // try {
  //   const txResult = await submitTx(connection, wallet, itx)
  //   console.log('Tx submitted', { txResult })
  // } catch (error) {
  //   console.error(error)
  // }
}

main().catch(console.error)
