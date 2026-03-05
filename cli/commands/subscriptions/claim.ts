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

  const { address: escrowStableVault } = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet.payer,
    mock.stableMint,
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

  // Fetch subscription to get daily USD.tel and last claim time
  const subscriptionData = await program.account.subscription.fetch(
    subscriptionPda,
  )

  // Calculate USD.tel to swap based on days since last claim
  const currentTime = Math.floor(Date.now() / 1000)
  const SECONDS_PER_DAY = 86400
  const daysSinceClaim = Math.floor(
    (currentTime - subscriptionData.lastClaim.toNumber()) / SECONDS_PER_DAY,
  )

  // Get remaining USD.tel in escrow vault
  const escrowStableAccount = await connection.getTokenAccountBalance(
    escrowStableVault,
  )
  const remainingStable = new BN(escrowStableAccount.value.amount)

  // Calculate USD.tel to swap: min(days_since_claim * daily_stable, remaining_stable)
  const stableToSwap = BN.min(
    new BN(daysSinceClaim).mul(subscriptionData.dailyStable),
    remainingStable,
  )

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
    mock.raydiumStableVault,
    stableToSwap,
    slippageBps,
  )

  console.log('Claim parameters:', {
    daysSinceClaim,
    stableToSwap: stableToSwap.toString(),
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
      escrowStableVault,
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
