import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionBlockhashCtor,
} from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import { getConfig, getIDL, loadWallet } from './utils'

// CONSTANTS
const DAWN_FEE = new BN(200) // 2% fee (dawn_fee)
const ANDRENA_FEE = new BN(500) // 5% fee (andrena_fee)
const ANDRENA_DAWN_RATIO = new BN(9000) // 90% fee (andrena_dawn_ratio)
const BUILDING_OWNER_DAWN_RATIO = new BN(8000) // 80% fee (bo_dawn_ratio)
const BUILDING_OWNER_ESCROW_RATIO = new BN(2000) // 20% fee (bo_escrow_ratio)

async function main() {
  const connection = new Connection('http://127.0.0.1:8899')
  const wallet = loadWallet()
  const provider = new anchor.AnchorProvider(connection, wallet)
  anchor.setProvider(provider)

  const config = await getConfig()
  const idl = await getIDL()

  const program = new anchor.Program<Plan>(idl as Plan, provider)

  console.log('PROGRAM_ID', program.programId.toBase58())

  const latestBlockHash = await connection.getLatestBlockhash({
    commitment: 'confirmed',
  })

  const itx = await program.methods
    .initialize(
      DAWN_FEE,
      ANDRENA_FEE,
      ANDRENA_DAWN_RATIO,
      BUILDING_OWNER_DAWN_RATIO,
      BUILDING_OWNER_ESCROW_RATIO,
    )
    .accounts({
      caller: wallet.payer.publicKey,
      usdcMint: new PublicKey(config.usdcMint),
      dawnMint: new PublicKey(config.dawnMint),
      andrenaUsdcAccount: new PublicKey(config.andrenaUsdcAccount),
      andrenaDawnAccount: new PublicKey(config.andrenaDawnAccount),
      dawnUsdcAccount: new PublicKey(config.dawnUsdcAccount),
    })
    .instruction()

  const tx = new Transaction({
    ...latestBlockHash,
    feePayer: wallet.payer.publicKey,
  } as TransactionBlockhashCtor).add(itx)

  const signed = await wallet.signTransaction(tx)

  let txSignature = await provider.connection.sendRawTransaction(
    signed.serialize(),
    {
      skipPreflight: true,
    },
  )

  const confirmationResult = await provider.connection.confirmTransaction(
    txSignature,
    'confirmed',
  )

  console.log({ confirmationResult })

  if (confirmationResult.value.err) {
    throw new Error(JSON.stringify(confirmationResult.value.err))
  } else {
    console.log('Transaction successfully submitted!')
  }
}

main().catch(console.error)
