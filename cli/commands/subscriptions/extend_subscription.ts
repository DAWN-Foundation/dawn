// @ts-nocheck
/**
 * CLI command to extend an existing subscription
 *
 * Usage:
 *   yarn dawn:extend_subscription --plan <PLAN_PDA> [--slippage <BPS>]
 *
 * Flags:
 *   --plan: Plan PDA address (required)
 *   --slippage: Slippage tolerance in BPS (default: 100 = 1%)
 *
 * For active subscriptions:
 *   - Protocol fees are swapped to DAWN immediately
 *   - Remaining USD.tel goes to escrow for future daily claims
 *   - Expiration is extended from current expiration
 *
 * For expired subscriptions:
 *   - Behaves like a new subscription (swaps fees + first day)
 *   - Expiration is set from current time
 */

import { PublicKey, SystemProgram } from '@solana/web3.js'

import { connect, getMock, getFlag, submitTx } from '../../shared/cli-utils'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { getSubscriptionPda, calculateSwapBounds } from '../../../sdk/utils'

async function main() {
  const plan = getFlag('--plan')
  if (!plan) {
    throw new Error('--plan is required')
  }
  const planPda = new PublicKey(plan)

  const { wallet, connection, program } = await connect()
  const mock = getMock()

  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [subscriptionPda] = getSubscriptionPda(program, planPda, wallet.payer)

  console.log({ subscriptionPda: subscriptionPda.toBase58() })

  // Verify subscription exists
  const subscription = await program.account.subscription.fetch(subscriptionPda)
  console.log('Extending subscription:', {
    plan: subscription.plan.toBase58(),
    subscriber: subscription.subscriber.toBase58(),
    currentExpiration: new Date(
      subscription.expiration.toNumber() * 1000,
    ).toISOString(),
  })

  const { address: escrowStableVault } = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mock.stableMint,
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
  const { address: walletStableAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      mock.stableMint,
      wallet.publicKey,
      false,
    )

  console.log({ walletStableAccount: walletStableAccount.toBase58() })

  const { address: walletDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet.payer,
      mock.dawnMint,
      wallet.publicKey,
      false,
    )

  // Fetch plan data
  const planData = await program.account.plan.fetch(planPda)

  // Get slippage from CLI flag (default 1%)
  const slippageBps = getFlag('--slippage')
    ? parseInt(getFlag('--slippage')!)
    : 100

  // Calculate minimum DAWN output with MEV protection for full plan.price
  // The program will scale this down proportionally for the actual swap amount
  const { minDawnOut, deadline } = await calculateSwapBounds(
    connection,
    mock.raydiumPool,
    mock.raydiumConfig,
    mock.raydiumDawnVault,
    mock.raydiumStableVault,
    planData.price, // Use full plan price for minDawnOut calculation
    slippageBps,
  )

  console.log('Extend subscription parameters:', {
    planPrice: planData.price.toString(),
    minDawnOut: minDawnOut.toString(),
    slippageBps: slippageBps,
    deadline: new Date(deadline.toNumber() * 1000).toISOString(),
  })

  const itx = await program.methods
    .extendSubscription(minDawnOut, deadline)
    .accountsPartial({
      caller: wallet.publicKey,
      config: mock.configPda,
      plan: planPda,
      subscription: subscriptionPda,
      // mints
      stableMint: mock.stableMint,
      dawnMint: mock.dawnMint,
      // raydium
      raydium: mock.raydium,
      raydiumAuthority: mock.raydiumAuthority,
      raydiumConfig: mock.raydiumConfig,
      raydiumPool: mock.raydiumPool,
      raydiumObservation: mock.raydiumObservation,
      // vaults
      raydiumDawnVault: mock.raydiumDawnVault,
      raydiumStableVault: mock.raydiumStableVault,
      // token accounts
      userStableAccount: walletStableAccount,
      userDawnAccount: walletDawnAccount,
      feePoolDawnAccount: mock.feePoolDawnAccount,
      escrowStableVault,
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
    console.log('Subscription extended successfully!', { txResult })

    // Fetch updated subscription
    const updatedSubscription = await program.account.subscription.fetch(
      subscriptionPda,
    )
    console.log('Updated subscription:', {
      newExpiration: new Date(
        updatedSubscription.expiration.toNumber() * 1000,
      ).toISOString(),
      dailyStable: updatedSubscription.dailyStable.toString(),
      claimableDawn: updatedSubscription.claimableDawn.toString(),
    })
  } catch (error) {
    console.error('Error extending subscription:', error)
  }
}

main().catch(console.error)
