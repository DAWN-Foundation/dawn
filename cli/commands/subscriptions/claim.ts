import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js'

import { Dawn } from '../../../target/types/dawn'
import { connect, getMock, getFlag, getIDL, getWallet, submitTx } from '../../shared/cli-utils'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

async function main() {
  const subscription = getFlag('--subscription')
  if (!subscription) {
    throw new Error('--subscription is required')
  }
  const subscriptionPda = new PublicKey(subscription)

  const { wallet, connection, program } = await connect()
  const mock = getMock()

  console.log({ PROGRAM_ID: program.programId.toBase58() })
  console.log({ subscriptionPda: subscriptionPda.toBase58() })

  // find the subscription
  const sub = await program.account.subscription.fetch(subscriptionPda)
  const planPda = sub.plan

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
  const { address: walletDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      mock.dawnMint,
      wallet.publicKey,
      true,
    )

  const itx = await program.methods
    .claim()
    .accountsPartial({
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
      escrowUsdcVault,
      escrowDawnVault,
      serviceProviderDawnAccount: walletDawnAccount,
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
