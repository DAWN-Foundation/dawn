import { PublicKey, SystemProgram } from '@solana/web3.js'

import { connect, getMock, getFlag, submitTx } from './utils'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { getSubscriptionPda } from '../utils'

async function main() {
  const plan = getFlag('--plan')
  if (!plan) {
    throw new Error('--plan is required')
  }
  const planPda = new PublicKey(plan)

  const device = getFlag('--device')
  const devicePda = device ? new PublicKey(device) : null

  const { wallet, connection, program } = await connect()
  const mock = getMock()

  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [subscriptionPda] = getSubscriptionPda(program, planPda, wallet.payer)

  console.log({ subscriptionPda: subscriptionPda.toBase58() })

  const { address: escrowUsdcVault } = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mock.usdcMint,
    planPda,
    true,
  )

  const { address: escrowDawnVault } = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mock.dawnMint,
    planPda,
    true,
  )

  // get wallet token accounts
  const { address: walletUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      mock.usdcMint,
      wallet.publicKey,
      false,
    )

  console.log({ walletUsdcAccount: walletUsdcAccount.toBase58() })

  const { address: walletDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      mock.dawnMint,
      wallet.publicKey,
      false,
    )

  const itx = await program.methods
    .subscribe()
    .accounts({
      caller: wallet.publicKey,
      config: mock.configPda,
      plan: planPda,
      device: devicePda,
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
      feePoolDawnAccount: mock.feePoolDawnAccount,
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
