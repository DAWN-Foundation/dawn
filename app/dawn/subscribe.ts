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

  // // for now ensure wallet is customer
  // if (wallet.publicKey.toBase58() !== mock.customer.publicKey.toBase58()) {
  //   throw new Error('Wallet must be customer [for now]')
  // }

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

  const { address: escrowUsdcVault } = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mock.usdcMint,
    subscriptionPda,
    true,
  )

  const { address: escrowDawnVault } = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mock.dawnMint,
    subscriptionPda,
    true,
  )

  // get wallet token accounts
  const { address: walletUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      mock.usdcMint,
      wallet.publicKey,
      true,
    )

  const { address: walletDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      mock.dawnMint,
      wallet.publicKey,
      true,
    )

  const itx = await program.methods
    .subscribe()
    .accounts({
      caller: wallet.publicKey,
      config: mock.configPda,
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
      userUsdcAccount: walletUsdcAccount,
      userDawnAccount: walletDawnAccount,
      daoDawnAccount: mock.daoDawnAccount,
      validatorDawnAccount: mock.validatorDawnAccount,
      medallionDawnAccount: mock.medallionDawnAccount,
      escrowUsdcVault,
      escrowDawnVault,
      // programs
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([wallet.payer])
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
