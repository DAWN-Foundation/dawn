import { PublicKey, SystemProgram } from '@solana/web3.js'
import { BN } from '@coral-xyz/anchor'

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

  // Fetch plan and config to calculate USDC amount
  const planData = await program.account.plan.fetch(planPda)
  const configData = await program.account.config.fetch(mock.configPda)

  // Calculate USDC to swap - must match program's calculate_usdc_fee logic
  // The program only swaps: total_fees + one_day_worth
  const BPS_DENOMINATOR = new BN(10000)
  
  // Calculate individual fees from plan price
  const daoFee = planData.price.mul(configData.daoFee).div(BPS_DENOMINATOR)
  const validatorFee = planData.price.mul(configData.validatorFee).div(BPS_DENOMINATOR)
  const medallionFee = planData.price.mul(configData.medallionFee).div(BPS_DENOMINATOR)
  
  // Total fees to swap
  const totalUsdcFee = daoFee.add(validatorFee).add(medallionFee)
  
  // Remainder after fees
  const remainder = planData.price.sub(totalUsdcFee)
  
  // Daily amount (one day's worth)
  const dailyDawnInUsdc = remainder.div(new BN(planData.duration))
  
  // Amount to swap = fees + one day
  const usdcToSwap = totalUsdcFee.add(dailyDawnInUsdc)

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

  console.log('Subscribe parameters:', {
    usdcToSwap: usdcToSwap.toString(),
    minDawnOut: minDawnOut.toString(),
    slippageBps: slippageBps,
    deadline: new Date(deadline.toNumber() * 1000).toISOString(),
  })

  const itx = await program.methods
    .subscribe(minDawnOut, deadline)
    .accountsPartial({
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
