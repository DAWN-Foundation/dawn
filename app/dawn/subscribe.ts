import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import {
  connect,
  getMock,
  getFlag,
  getIDL,
  getPlanPda,
  getWallet,
  submitTx,
} from './utils'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

async function main() {
  const plan = getFlag('--plan')
  if (!plan) {
    throw new Error('--plan is required')
  }
  const planPda = new PublicKey(plan)

  const { wallet, connection, program } = await connect()
  const mock = getMock()

  // for now ensure wallet is tester
  if (wallet.publicKey.toBase58() !== mock.tester.publicKey.toBase58()) {
    throw new Error('Wallet must be tester [for now]')
  }

  const configPda = new PublicKey(mock.configPda)
  const userUsdcAccount = new PublicKey(mock.testerUsdcAccount)

  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [subscriptionPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('subscription'),
      Buffer.from(planPda.toBytes()),
      Buffer.from(wallet.publicKey.toBytes()),
    ],
    program.programId,
  )
  console.log({ subscriptionPda: subscriptionPda.toBase58() })

  const escrowUsdcVault = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mock.usdcMint,
    subscriptionPda,
    true,
  )

  const escrowDawnVault = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mock.dawnMint,
    subscriptionPda,
    true,
  )

  const itx = await program.methods
    .subscribe()
    .accounts({
      caller: mock.tester.publicKey,
      config: configPda,
      plan: planPda,
      subscription: subscriptionPda,
      // mints
      usdcMint: mock.usdcMint,
      dawnMint: mock.dawnMint,
      // raydium
      raydium: mock.raydium,
      raydiumAuthority: mock.raydiumAuthority,
      raydiumConfig: mock.raydiumConfig,
      raydiumPool: mock.raydiumPool,
      raydiumObservation: mock.raydiumObservation,
      // vaults
      raydiumDawnVault: mock.raydiumDawnVault,
      raydiumUsdcVault: mock.raydiumUsdcVault,
      // token accounts
      userUsdcAccount: mock.testerUsdcAccount,
      userDawnAccount: mock.testerDawnAccount,
      daoDawnAccount: mock.daoDawnAccount,
      validatorDawnAccount: mock.validatorDawnAccount,
      medallionDawnAccount: mock.medallionDawnAccount,
      escrowUsdcVault: escrowUsdcVault.address,
      escrowDawnVault: escrowDawnVault.address,
      // programs
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
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
