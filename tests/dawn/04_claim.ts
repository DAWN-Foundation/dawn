import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { PublicKey, SendTransactionError, SystemProgram } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import {
  confirmTx,
  getEvent,
  getPlanPda,
  getRaydiumProgram,
  mock,
} from '../../app/utils'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

const SECONDS_PER_DAY = 86_400
const BPS_DENOMINATOR = new BN(10_000)
const TOLERANCE_BPS = new BN(9975)

const Q32 = new BN(2).pow(new BN(32))

describe('dawn::claim', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.Dawn as Program<Dawn>
  const wallet = provider.wallet as NodeWallet

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )

  let buildingPda: PublicKey
  let planPda: PublicKey
  let plan: Awaited<ReturnType<typeof program.account.plan.fetch>>
  let subscription: Awaited<
    ReturnType<typeof program.account.subscription.fetch>
  >
  let subscriptionPda: PublicKey
  let accounts: Record<string, PublicKey>

  before(async () => {
    const plans = await program.account.plan.all()
    assert.ok(plans.length > 0)
    plan = plans[0].account
    planPda = plans[0].publicKey

    const buildings = await program.account.building.all()
    assert.ok(buildings.length > 0)
    buildingPda = buildings[0].publicKey

    const subscriptions = await program.account.subscription.all()
    assert.ok(subscriptions.length > 0)
    console.log({ subscriptions })
    subscription = subscriptions[0].account
    subscriptionPda = subscriptions[0].publicKey

    // Get USDC vault token account for subscription escrow
    const { address: escrowUsdcVault } =
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        mock.buildingOwner,
        mock.usdcMint,
        subscriptionPda,
        true,
      )

    // Get DAWN vault token account for subscription escrow
    const { address: escrowDawnVault } =
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        mock.buildingOwner,
        mock.dawnMint,
        subscriptionPda,
        true,
      )

    // accounts for a successful subscription
    accounts = {
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
      escrowUsdcVault: escrowUsdcVault,
      escrowDawnVault: escrowDawnVault,
      providerDawnAccount: mock.buildingOwnerDawnAccount,
      // programs
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }
  })

  it('mock setup', () => {
    assert.exists(mock)
    assert.exists(plan)
    assert.ok(plan.owner.equals(mock.buildingOwner.publicKey))
    assert.exists(planPda)
    assert.exists(buildingPda)
    assert.exists(subscriptionPda)
    assert.exists(accounts)
  })

  it('claims daily DAWN', async () => {
    // Mint 1'000 USDC to Tester account
    await mintTo(
      provider.connection,
      mock.tester, // Payer for tx
      mock.usdcMint, // Mint account
      mock.testerUsdcAccount, // Destination
      wallet.payer, // Authority
      1_000 * 10 ** 6, // Mint 1,000 USDC (remember 6 decimals)
    )

    const testerUsdcBalanceBefore = new BN(
      (
        await getAccount(provider.connection, mock.testerUsdcAccount)
      ).amount.toString(),
    )

    const daoDawnBalanceBefore = new BN(
      (
        await getAccount(provider.connection, mock.daoDawnAccount)
      ).amount.toString(),
    )

    const validatorDawnBalanceBefore = new BN(
      (
        await getAccount(provider.connection, mock.validatorDawnAccount)
      ).amount.toString(),
    )

    const medallionDawnBalanceBefore = new BN(
      (
        await getAccount(provider.connection, mock.medallionDawnAccount)
      ).amount.toString(),
    )

    const escrowUsdcBalanceBefore = new BN(
      (
        await getAccount(provider.connection, accounts.escrowUsdcVault)
      ).amount.toString(),
    )

    const escrowDawnBalanceBefore = new BN(
      (
        await getAccount(provider.connection, accounts.escrowDawnVault)
      ).amount.toString(),
    )

    // get balances of raydium vaults
    const raydiumDawnVault = await getAccount(
      provider.connection,
      accounts.raydiumDawnVault,
    )
    const raydiumUsdcVault = await getAccount(
      provider.connection,
      accounts.raydiumUsdcVault,
    )

    const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
    const usdcVaultAmount = new BN(raydiumUsdcVault.amount.toString())
    const price = dawnVaultAmount.mul(Q32).div(usdcVaultAmount)

    const tx = await program.methods
      .claim(subscription.subscriber)
      .accounts(accounts)
      .signers([mock.tester])
      .rpc()

    assert.ok(tx.length > 0)
    await confirmTx(provider.connection, tx)

    // // make sure event was emitted
    // const event = await getEvent<Subscribed>(program, tx, 'Subscribed')
    // assert.ok(event.subscription.equals(subscriptionPda))
    // assert.ok(event.subscriber.equals(mock.tester.publicKey))
    // assert.ok(event.plan.equals(planPda))
    // assert.ok(event.expiration > 0)
    // assert.ok(event.swapPrice.eq(price))

    // make sure the tester USDC account was debited
    const testerUsdcBalanceAfter = new BN(
      (
        await getAccount(provider.connection, mock.testerUsdcAccount)
      ).amount.toString(),
    )
    assert.ok(testerUsdcBalanceAfter.lt(testerUsdcBalanceBefore))

    // make sure the amount debited is the plan price with 0.25% tolerance (to account for slippage)
    const diff = testerUsdcBalanceBefore.sub(testerUsdcBalanceAfter)
    assert.ok(diff.gte(plan.price.mul(TOLERANCE_BPS).div(BPS_DENOMINATOR)))

    // calculate total fee in USDC
    const totalFeeBps = mock.daoFee
      .add(mock.validatorFee)
      .add(mock.medallionFee)
    const totalUsdcFee = plan.price.mul(totalFeeBps).div(BPS_DENOMINATOR)

    // make sure the building owner escrow USDC vault account was debited
    const usdcRemainder = plan.price.sub(totalUsdcFee)
    const dailyUsdc = usdcRemainder.div(new BN(plan.duration))
    const dailyDawn = dailyUsdc.mul(price).div(Q32)
    const usdcExpected = usdcRemainder.sub(dailyUsdc)
    const escrowUsdcBalanceAfter = new BN(
      (
        await getAccount(provider.connection, accounts.escrowUsdcVault)
      ).amount.toString(),
    )
    assert.ok(
      escrowUsdcBalanceAfter.sub(escrowUsdcBalanceBefore).eq(usdcExpected),
    )

    // make sure the building owner escrow DAWN vault account was credited with the daily DAWN portion
    const escrowDawnBalanceAfter = new BN(
      (
        await getAccount(provider.connection, accounts.escrowDawnVault)
      ).amount.toString(),
    )
    assert.ok(escrowDawnBalanceAfter.sub(escrowDawnBalanceBefore).eq(dailyDawn))

    const totalDawn = totalUsdcFee.add(dailyUsdc).mul(price).div(Q32)
    const totalDawnWithSlippage = totalDawn
      .mul(BPS_DENOMINATOR.sub(new BN(100)))
      .div(BPS_DENOMINATOR)
    const totalDawnFee = totalDawnWithSlippage.sub(dailyDawn)

    // make sure the DAO DAWN account was credited with the DAO fee portion
    const daoFee = totalDawnFee.mul(mock.daoFee).div(totalFeeBps)
    const daoDawnBalanceAfter = new BN(
      (
        await getAccount(provider.connection, mock.daoDawnAccount)
      ).amount.toString(),
    )
    assert.ok(daoDawnBalanceAfter.sub(daoDawnBalanceBefore).eq(daoFee))

    // make sure the validator DAWN account was credited with the validator fee portion
    const validatorFee = totalDawnFee.mul(mock.validatorFee).div(totalFeeBps)
    const validatorDawnBalanceAfter = new BN(
      (
        await getAccount(provider.connection, mock.validatorDawnAccount)
      ).amount.toString(),
    )
    assert.ok(
      validatorDawnBalanceAfter
        .sub(validatorDawnBalanceBefore)
        .eq(validatorFee),
    )

    // make sure the medallion DAWN account was credited with the medallion fee portion
    const medallionFee = totalDawnFee.mul(mock.medallionFee).div(totalFeeBps)
    const medallionDawnBalanceAfter = new BN(
      (
        await getAccount(provider.connection, mock.medallionDawnAccount)
      ).amount.toString(),
    )
    assert.ok(
      medallionDawnBalanceAfter
        .sub(medallionDawnBalanceBefore)
        .eq(medallionFee),
    )

    // get block time, and calculate expected expiration
    let txDetails = await provider.connection.getParsedTransaction(
      tx,
      'confirmed',
    )
    let expiration = txDetails.blockTime + plan.duration * SECONDS_PER_DAY

    // // make sure the subscription was created
    // const subscription = await program.account.subscription.fetch(subscriptionPda)
    // assert.ok(subscription.subscriber.equals(mock.tester.publicKey))
    // assert.ok(subscription.plan.equals(planPda))
    // assert.equal(subscription.expiration.toNumber(), expiration)
    // assert.ok(subscription.lastClaim.eq(new BN(txDetails.blockTime)))
    // assert.ok(subscription.claimableDawn.eq(dailyDawn))
    // assert.ok(subscription.dailyUsdc.eq(dailyUsdc))
    // assert.equal(subscription.bump, subscriptionBump)
  })
})
