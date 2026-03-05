import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js'

import { Dawn } from '../../../target/types/dawn'
import {
  connect,
  getMock,
  getFlag,
  getIDL,
  getWallet,
  submitTx,
} from '../../shared/cli-utils'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { calculateSwapBounds } from '../../../sdk/utils'

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

  // Get remaining USDC in escrow vault (claim swaps all remaining USDC)
  const escrowUsdcAccount = await connection.getTokenAccountBalance(
    escrowUsdcVault,
  )
  const usdcToSwap = new BN(escrowUsdcAccount.value.amount)

  // Get slippage from CLI flag (default 1%)
  const slippageBps = getFlag('--slippage')
    ? parseInt(getFlag('--slippage')!)
    : 100

  // Calculate minimum DAWN output with MEV protection
  const { minDawnOut, deadline } = await calculateSwapBounds(
    connection,
    mock.raydiumPool,
    mock.raydiumConfig,
    mock.raydiumDawnVault,
    mock.raydiumUsdcVault,
    usdcToSwap,
    slippageBps,
  )

  console.log('Claim parameters:', {
    usdcToSwap: usdcToSwap.toString(),
    minDawnOut: minDawnOut.toString(),
    slippageBps: slippageBps,
    deadline: new Date(deadline.toNumber() * 1000).toISOString(),
  })

  const itx = await program.methods
    .claim(minDawnOut, deadline)
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
