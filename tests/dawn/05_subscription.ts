import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError, Wallet } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { PublicKey, SendTransactionError, SystemProgram } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { mintTo, createAssociatedTokenAccount } from 'spl-token-bankrun'

import { Dawn } from '../../target/types/dawn'
import {
  getEvent,
  getPlanPda,
  mock,
  getProvider,
  loadWallet,
  confirmTx,
  getSubscriptionPda,
  getDevicePda,
  MacAddress,
  getDeviceLocationPda,
  getLocalDomainPda,
  getIpLeasePda,
} from '../../sdk/utils'
import { beforeAll, expect } from '@jest/globals'
import { Clock } from 'solana-bankrun'
import { getBalance } from '../../cli/shared/cli-utils'
import { oneDayLaterPlanPda } from './04_plan'

const SECONDS_PER_DAY = 86_400
export const BPS_DENOMINATOR = new BN(10_000)
const TOLERANCE_BPS = new BN(9500)

export const Q32 = new BN(2).pow(new BN(32))

/**
 * Helper function to calculate minDawnOut with slippage tolerance
 *
 * @param usdcAmount - Amount of USDC to swap
 * @param price - Current pool price (Q32 format)
 * @param slippageBps - Slippage tolerance in basis points (default: 500 = 5%)
 *                      Can be 0-500 bps (0%-5%) to match program validation
 *                      The program enforces MAX_SLIPPAGE_TOLERANCE_BPS = 500
 *
 * @returns Minimum DAWN output that will be accepted
 */
export function calculateMinDawnOut(
  usdcAmount: BN,
  price: BN,
  slippageBps: number = 50,
): BN {
  // expectedOut = (usdcAmount * price) / Q32
  const expectedOut = usdcAmount.mul(price).div(Q32)
  // Apply slippage: minOut = expectedOut * (10000 - slippageBps) / 10000
  const minOut = expectedOut.mul(new BN(10000 - slippageBps)).div(new BN(10000))
  return minOut
}

/**
 * Helper function to get deadline (30 seconds from now)
 * Must be <= MAX_DEADLINE_OFFSET_SECONDS (3600 seconds = 1 hour) from current time
 *
 * @param provider - Bankrun provider to get current time
 * @returns Deadline timestamp (current time + 30 seconds)
 */
export async function getDeadline(provider: BankrunProvider): Promise<BN> {
  const clock = await provider.context.banksClient.getClock()
  const currentTime = clock.unixTimestamp
  return new BN(currentTime.toString()).add(new BN(30))
}

interface Subscribed {
  subscription: PublicKey
  plan: PublicKey
  subscriber: PublicKey
  device: PublicKey | null
  expiration: number
  swapPrice: BN
  createdAt: number
}

interface SubscriptionExtended {
  subscription: PublicKey
  plan: PublicKey
  subscriber: PublicKey
  device: PublicKey | null
  expiration: BN
  swapPrice: BN
  createdAt: number
}

export const subscriptionTests = () =>
  describe('dawn::subscription', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>

    let plan: Awaited<ReturnType<typeof program.account.plan.fetch>>
    let accounts: Record<string, PublicKey>

    let oneDayLaterEscrowUsdcVault: PublicKey
    let oneDayLaterEscrowDawnVault: PublicKey

    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.customer)
      anchor.setProvider(provider)

      program = anchor.workspace.DAWN as Program<Dawn>

      // since raydiumn pool open time is 1 second in the future
      // set clock to 2 seconds in the future to allow swaps
      const clock = await provider.context.banksClient.getClock()
      provider.context.setClock(
        new Clock(
          clock.slot,
          clock.epochStartTimestamp,
          clock.epoch,
          clock.leaderScheduleEpoch,
          clock.unixTimestamp + 2n,
        ),
      )

      const planAccount = await provider.context.banksClient.getAccount(
        mock.planPda,
      )
      plan = program.coder.accounts.decode(
        'plan',
        Buffer.from(planAccount.data),
      )

      oneDayLaterEscrowUsdcVault = await createAssociatedTokenAccount(
        provider.context.banksClient,
        mock.serviceProvider,
        mock.usdcMint,
        oneDayLaterPlanPda,
      )

      oneDayLaterEscrowDawnVault = await createAssociatedTokenAccount(
        provider.context.banksClient,
        mock.serviceProvider,
        mock.dawnMint,
        oneDayLaterPlanPda,
      )

      // accounts for a successful subscription
      accounts = {
        caller: mock.customer.publicKey,
        config: mock.configPda,
        plan: mock.planPda,
        device: null,
        subscription: mock.subscriptionPda,
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
        userUsdcAccount: mock.customerUsdcAccount,
        userDawnAccount: mock.customerDawnAccount,
        feePoolDawnAccount: mock.feePoolDawnAccount,
        escrowUsdcVault: mock.escrowUsdcVault,
        escrowDawnVault: mock.escrowDawnVault,
        // programs
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }
    })

    test('mock setup', () => {
      assert.exists(mock)
      assert.exists(plan)
      assert.ok(plan.owner.equals(mock.serviceProvider.publicKey))
      assert.exists(mock.planPda)
      assert.exists(mock.devicePda)
      assert.exists(mock.subscriptionPda)
      assert.exists(mock.subscriptionBump)
      assert.exists(accounts)
    })

    test('cannot subscribe to a plan that doesnt exist', async () => {
      const [planPda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        mock.planName,
        new BN(1000),
        30,
        100,
        new BN(1000),
        null,
        mock.serviceAgreementPda,
      )

      const [badSubscriptionPda] = getSubscriptionPda(
        program,
        mock.planPda,
        mock.customer,
      )

      try {
        // Calculate valid minDawnOut for this test (expects account error, not validation error)
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
        const plan = await program.account.plan.fetch(mock.planPda)
        // Use plan.price for minDawnOut - program will scale it proportionally
        const minDawnOut = calculateMinDawnOut(plan.price, price)
        const deadline = await getDeadline(provider)

        await program.methods
          .subscribe(minDawnOut, deadline)
          .accountsPartial({
            ...accounts,
            plan: planPda,
            subscription: badSubscriptionPda,
          })
          .signers([mock.customer])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(
          err.error.errorMessage,
          'The program expected this account to be already initialized',
        )
      }
    })

    test('cannot subscribe if does not have enough USDC', async () => {
      try {
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

        // Use plan.price for minDawnOut - program will scale it proportionally
        const minDawnOut = calculateMinDawnOut(plan.price, price)
        const deadline = await getDeadline(provider)

        await program.methods
          .subscribe(minDawnOut, deadline)
          .accounts(accounts)
          .signers([mock.customer])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof SendTransactionError)
        const err: SendTransactionError = error
        const insufficientFunds = err.logs.find((log) =>
          log.includes('Program log: Error: insufficient funds'),
        )
        assert.ok(insufficientFunds)
      } finally {
        // Mint 1'000 USDC to Customer account
        await mintTo(
          provider.context.banksClient, // Banks client
          wallet.payer, // Payer for transaction
          mock.usdcMint, // Mint
          mock.customerUsdcAccount, // Token account
          wallet, // Mint authority
          BigInt(1_000_000_000_000), // 6 decimals
        )
      }
    })

    test('cannot subscribe to a plan that has not started yet', async () => {
      const [subscriptionPda] = getSubscriptionPda(
        program,
        oneDayLaterPlanPda,
        mock.customer,
      )

      try {
        // Calculate valid minDawnOut for this test (expects start time error, not validation error)
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
        const plan = await program.account.plan.fetch(oneDayLaterPlanPda)
        // Use plan.price for minDawnOut - program will scale it proportionally
        const minDawnOut = calculateMinDawnOut(plan.price, price)
        const deadline = await getDeadline(provider)

        await program.methods
          .subscribe(minDawnOut, deadline)
          .accountsPartial({
            ...accounts,
            plan: oneDayLaterPlanPda,
            subscription: subscriptionPda,
            escrowUsdcVault: oneDayLaterEscrowUsdcVault,
            escrowDawnVault: oneDayLaterEscrowDawnVault,
          })
          .signers([mock.customer])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Invalid start time')
      }
    })

    test('cannot subscribe with expired deadline', async () => {
      const clock = await provider.context.banksClient.getClock()
      const currentTime = clock.unixTimestamp
      const expiredDeadline = new BN(currentTime.toString()).sub(new BN(1))

      // Calculate valid minDawnOut for this test (expects deadline error, not validation error)
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
      const plan = await program.account.plan.fetch(mock.planPda)
      // Use plan.price for minDawnOut - program will scale it proportionally
      const minDawnOut = calculateMinDawnOut(plan.price, price)

      try {
        await program.methods
          .subscribe(minDawnOut, expiredDeadline)
          .accounts(accounts)
          .signers([mock.customer])
          .rpc()
        assert.ok(false, 'Should have failed with expired deadline')
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(
          err.error.errorMessage,
          'Transaction deadline has expired',
        )
      }
    })

    test('cannot subscribe with deadline too far in the future', async () => {
      const clock = await provider.context.banksClient.getClock()
      const currentTime = clock.unixTimestamp
      // MAX_DEADLINE_OFFSET_SECONDS is 3600 (1 hour), so use 3700 to exceed it
      const tooFarDeadline = new BN(currentTime.toString()).add(new BN(3700))

      // Calculate valid minDawnOut for this test (expects deadline error, not validation error)
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
      const plan = await program.account.plan.fetch(mock.planPda)
      // Use plan.price for minDawnOut - program will scale it proportionally
      const minDawnOut = calculateMinDawnOut(plan.price, price)

      try {
        await program.methods
          .subscribe(minDawnOut, tooFarDeadline)
          .accounts(accounts)
          .signers([mock.customer])
          .rpc()
        assert.ok(false, 'Should have failed with deadline too far in future')
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(
          err.error.errorMessage,
          'Deadline is too far in the future',
        )
      }
    })

    test('cannot subscribe with min_dawn_out too high', async () => {
      // Get pool price for calculation
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

      const plan = await program.account.plan.fetch(mock.planPda)

      // Calculate expected output for plan.price and set min_dawn_out higher than expected
      // After scaling, this will be higher than expected for the actual swap amount
      const expectedOut = plan.price.mul(price).div(Q32)
      const minDawnOutTooHigh = expectedOut.add(new BN(1)) // Higher than expected

      try {
        const deadline = await getDeadline(provider)
        await program.methods
          .subscribe(minDawnOutTooHigh, deadline)
          .accounts(accounts)
          .signers([mock.customer])
          .rpc()
        assert.ok(false, 'Should have failed with min_dawn_out too high')
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        // Can be either "Invalid minimum output amount" or "Exceeds desired slippage limit" from Raydium
        assert.ok(
          err.error.errorMessage === 'Invalid minimum output amount' ||
            err.error.errorMessage === 'Exceeds desired slippage limit',
          `Expected slippage error but got: ${err.error.errorMessage}`,
        )
      }
    })

    test('cannot subscribe with min_dawn_out too low (below minimum slippage)', async () => {
      // Get pool price for calculation
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

      const plan = await program.account.plan.fetch(mock.planPda)

      // Calculate expected output for plan.price
      const expectedOut = plan.price.mul(price).div(Q32)
      // MAX_SLIPPAGE_TOLERANCE_BPS = 500, so minimum allowed is 95% of expected (9500/10000)
      // Use 94% (9400/10000) which is below the 95% minimum, so should fail
      // After scaling, this will still be 94% of expected for the actual swap amount
      const minDawnOutTooLow = expectedOut
        .mul(new BN(9400))
        .div(BPS_DENOMINATOR)

      try {
        const deadline = await getDeadline(provider)
        await program.methods
          .subscribe(minDawnOutTooLow, deadline)
          .accounts(accounts)
          .signers([mock.customer])
          .rpc()
        assert.ok(false, 'Should have failed with min_dawn_out too low')
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(
          err.error.errorMessage,
          'Invalid minimum output amount',
        )
      }
    })

    test('can subscribe to a plan that has already started', async () => {
      const [subscriptionPda] = getSubscriptionPda(
        program,
        oneDayLaterPlanPda,
        mock.customer,
      )

      // set chain time to 1 day in the future (with buffer for CI timing)
      const clock = await provider.context.banksClient.getClock()
      provider.context.setClock(
        new Clock(
          clock.slot,
          clock.epochStartTimestamp,
          clock.epoch,
          clock.leaderScheduleEpoch,
          clock.unixTimestamp + 86400n + 300n, // Add 5 minutes buffer for CI
        ),
      )

      // Calculate valid minDawnOut
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
      const plan = await program.account.plan.fetch(oneDayLaterPlanPda)
      // Use plan.price for minDawnOut - program will scale it proportionally
      const minDawnOut = calculateMinDawnOut(plan.price, price)
      const deadline = await getDeadline(provider)

      const tx = await program.methods
        .subscribe(minDawnOut, deadline)
        .accountsPartial({
          ...accounts,
          plan: oneDayLaterPlanPda,
          subscription: subscriptionPda,
          escrowUsdcVault: oneDayLaterEscrowUsdcVault,
          escrowDawnVault: oneDayLaterEscrowDawnVault,
        })
        .signers([mock.customer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<Subscribed>(program, txDetails, 'subscribed')
      assert.ok(event.subscription.equals(subscriptionPda))
      assert.ok(event.subscriber.equals(mock.customer.publicKey))
      assert.ok(event.plan.equals(oneDayLaterPlanPda))
      assert.ok(event.expiration > 0)
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure the subscription was created
      let subscription = await program.account.subscription.fetch(
        subscriptionPda,
      )
      expect(new BN(subscription.createdAt).gt(new BN(0))).toBeTruthy()
      assert.ok(subscription.subscriber.equals(mock.customer.publicKey))
    })

    test('subscribes to the plan', async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))

      const testerUsdcBalanceBefore = await getBalance(
        provider.connection,
        mock.customerUsdcAccount,
      )

      const feePoolDawnBalanceBefore = await getBalance(
        provider.connection,
        mock.feePoolDawnAccount,
      )

      const escrowUsdcBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )

      const escrowDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
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

      // Calculate fee amounts for assertions later
      const config = await program.account.config.fetch(mock.configPda)
      const totalFeeBpsCalc = config.daoFee
        .add(config.validatorFee)
        .add(config.medallionFee)
      const totalFeeUsdc = plan.price.mul(totalFeeBpsCalc).div(BPS_DENOMINATOR)
      const remainder = plan.price.sub(totalFeeUsdc)
      const dailyUsdcCalc = remainder.div(new BN(plan.duration))
      const usdcToSwap = totalFeeUsdc.add(dailyUsdcCalc)

      // Use plan.price for minDawnOut - program will scale it proportionally
      const minDawnOut = calculateMinDawnOut(plan.price, price)
      const deadline = await getDeadline(provider)

      const timeBefore = await provider.context.banksClient.getClock()

      const tx = await program.methods
        .subscribe(minDawnOut, deadline)
        .accounts(accounts)
        .signers([mock.customer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<Subscribed>(program, txDetails, 'subscribed')
      assert.ok(event.subscription.equals(mock.subscriptionPda))
      assert.ok(event.plan.equals(mock.planPda))
      assert.ok(event.subscriber.equals(mock.customer.publicKey))
      expect(event.device).toBeNull()
      assert.ok(event.expiration > 0)
      // swapPrice is now the actual DAWN output (not Q32 price), so just verify it's reasonable
      const swapPriceBN = new BN(event.swapPrice.toString())
      assert.ok(swapPriceBN.gt(new BN(0)), 'swapPrice should be greater than 0')
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure the customer USDC account was debited
      const testerUsdcBalanceAfter = await getBalance(
        provider.connection,
        mock.customerUsdcAccount,
      )
      assert.ok(testerUsdcBalanceAfter.lt(testerUsdcBalanceBefore))

      // make sure the amount debited is the plan price with 0.25% tolerance (to account for slippage)
      const diff = testerUsdcBalanceBefore.sub(testerUsdcBalanceAfter)
      assert.ok(diff.gte(plan.price.mul(TOLERANCE_BPS).div(BPS_DENOMINATOR)))

      // calculate total fee in USDC
      const totalFeeBpsAssert1 = mock.daoFee
        .add(mock.validatorFee)
        .add(mock.medallionFee)
      const totalUsdcFee = plan.price
        .mul(totalFeeBpsAssert1)
        .div(BPS_DENOMINATOR)

      // make sure the device owner escrow USDC vault account was debited
      const usdcRemainder = plan.price.sub(totalUsdcFee)
      const dailyUsdcAssert1 = usdcRemainder.div(new BN(plan.duration))
      const dailyDawn = dailyUsdcAssert1.mul(price).div(Q32)
      const usdcExpected = usdcRemainder.sub(dailyUsdcAssert1)
      const escrowUsdcBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )
      assert.ok(
        escrowUsdcBalanceAfter.sub(escrowUsdcBalanceBefore).eq(usdcExpected),
      )

      // make sure the device owner escrow DAWN vault account was credited with the daily DAWN portion
      const escrowDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )

      // swapPriceBN is the actual DAWN output from the swap - calculate exact expected escrow
      // escrow_dawn = (actual_dawn_out * daily_usdc) / total_usdc
      const expectedEscrowDawn = swapPriceBN
        .mul(dailyUsdcAssert1)
        .div(usdcToSwap)

      const actualEscrowDawn = escrowDawnBalanceAfter.sub(
        escrowDawnBalanceBefore,
      )
      assert.ok(
        actualEscrowDawn.eq(expectedEscrowDawn),
        `Escrow DAWN ${actualEscrowDawn.toString()} should equal ${expectedEscrowDawn.toString()}`,
      )

      // Calculate exact expected fee: total_dawn_fee = actual_dawn_out - escrow_dawn
      const expectedFeeDawn = swapPriceBN.sub(expectedEscrowDawn)

      const feePoolDawnBalanceAfter = await getBalance(
        provider.connection,
        mock.feePoolDawnAccount,
      )
      const actualFeeDeposited = feePoolDawnBalanceAfter.sub(
        feePoolDawnBalanceBefore,
      )

      assert.ok(
        actualFeeDeposited.eq(expectedFeeDawn),
        `Fee ${actualFeeDeposited.toString()} should equal ${expectedFeeDawn.toString()}`,
      )

      // get block time, and calculate expected expiration
      const planInSeconds = plan.duration * SECONDS_PER_DAY
      const expiration = Number(timeBefore.unixTimestamp) + planInSeconds

      // make sure the subscription was created
      let subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      expect(new BN(subscription.createdAt).gt(new BN(0))).toBeTruthy()
      assert.ok(subscription.plan.equals(mock.planPda))
      assert.ok(subscription.subscriber.equals(mock.customer.publicKey))
      expect(subscription.device).toBeNull()
      assert.equal(subscription.expiration.toNumber(), expiration)
      assert.ok(
        subscription.lastClaim.eq(new BN(Number(timeBefore.unixTimestamp))),
      )
      // claimable_dawn is set to the actual escrow amount from proportional allocation
      assert.ok(subscription.claimableDawn.eq(actualEscrowDawn))
      assert.ok(subscription.dailyUsdc.eq(dailyUsdcAssert1))
      assert.equal(subscription.bump, mock.subscriptionBump)
    })

    test('extends active subscription', async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))

      // get expiration before extension
      const subscriptionBefore = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      const expirationBefore = new BN(subscriptionBefore.expiration)

      const testerUsdcBalanceBefore = await getBalance(
        provider.connection,
        mock.customerUsdcAccount,
      )

      const feePoolDawnBalanceBefore = await getBalance(
        provider.connection,
        mock.feePoolDawnAccount,
      )

      const escrowUsdcBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )

      const escrowDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
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

      // Calculate fee amounts for active subscription extension
      const config2 = await program.account.config.fetch(mock.configPda)
      const totalFeeBps2 = config2.daoFee
        .add(config2.validatorFee)
        .add(config2.medallionFee)
      const totalFeeUsdc2 = plan.price.mul(totalFeeBps2).div(BPS_DENOMINATOR)
      const remainder2 = plan.price.sub(totalFeeUsdc2)
      const dailyUsdc2 = remainder2.div(new BN(plan.duration))

      // For active extensions: provide minDawnOut for full plan.price
      // Code will scale it down for fee-only swap
      const minDawnOut = calculateMinDawnOut(plan.price, price) // Uses default 50 bps
      const deadline = await getDeadline(provider)

      const tx = await program.methods
        .extendSubscription(minDawnOut, deadline)
        .accounts(accounts)
        .signers([mock.customer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<SubscriptionExtended>(
        program,
        txDetails,
        'subscriptionExtended',
      )
      assert.ok(event.subscription.equals(mock.subscriptionPda))
      assert.ok(event.plan.equals(mock.planPda))
      assert.ok(event.subscriber.equals(mock.customer.publicKey))
      expect(event.device).toBeNull()
      assert.ok(
        event.expiration.eq(
          expirationBefore.add(new BN(plan.duration * SECONDS_PER_DAY)),
        ),
      )
      // swapPrice is now the actual DAWN output from the fee swap
      // For active subscriptions, only fees are swapped (not first day)
      const swapPriceBN = new BN(event.swapPrice.toString())
      assert.ok(
        swapPriceBN.gt(new BN(0)),
        'swapPrice should be > 0 for active subscriptions (fees are swapped)',
      )
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure the customer USDC account was debited
      const testerUsdcBalanceAfter = await getBalance(
        provider.connection,
        mock.customerUsdcAccount,
      )
      assert.ok(testerUsdcBalanceAfter.lt(testerUsdcBalanceBefore))

      // make sure the amount debited is the plan price with 0.25% tolerance (to account for slippage)
      const diff = testerUsdcBalanceBefore.sub(testerUsdcBalanceAfter)
      assert.ok(diff.gte(plan.price.mul(TOLERANCE_BPS).div(BPS_DENOMINATOR)))

      // calculate total fee in USDC
      const totalFeeBpsAssert2 = mock.daoFee
        .add(mock.validatorFee)
        .add(mock.medallionFee)
      const totalUsdcFee = plan.price
        .mul(totalFeeBpsAssert2)
        .div(BPS_DENOMINATOR)

      // For active subscriptions: fees are swapped to DAWN, non-fee USDC goes to escrow
      const escrowUsdcBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )
      const escrowDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )
      const feePoolDawnBalanceAfter = await getBalance(
        provider.connection,
        mock.feePoolDawnAccount,
      )

      // Only non-fee USDC goes to escrow (plan.price - totalFeeUsdc)
      const expectedEscrowUsdcIncrease = plan.price.sub(totalUsdcFee)
      assert.ok(
        escrowUsdcBalanceAfter
          .sub(escrowUsdcBalanceBefore)
          .eq(expectedEscrowUsdcIncrease),
        'Escrow USDC should increase by (plan.price - fees) for active subscriptions',
      )
      assert.ok(
        escrowDawnBalanceAfter.eq(escrowDawnBalanceBefore),
        'Escrow DAWN should not change for active subscriptions (fees go to fee pool)',
      )
      // Fees should be collected in DAWN for active subscriptions
      assert.ok(
        feePoolDawnBalanceAfter.gt(feePoolDawnBalanceBefore),
        'Fee pool DAWN should increase from swapped fees',
      )

      // get block time, and calculate expected expiration
      const planInSeconds = plan.duration * SECONDS_PER_DAY
      const expiration = expirationBefore.add(new BN(planInSeconds))

      // make sure the subscription expiration was extended
      let subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      assert.ok(subscription.expiration.eq(expiration))

      // make sure other subscription fields are unchanged
      expect(subscription.createdAt.eq(subscriptionBefore.createdAt))
      assert.ok(subscription.plan.equals(subscriptionBefore.plan))
      assert.ok(subscription.subscriber.equals(subscriptionBefore.subscriber))
      expect(subscription.device).toBeNull()
      assert.ok(subscription.lastClaim.eq(subscriptionBefore.lastClaim))
      // claimableDawn should remain unchanged for active subscriptions
      assert.ok(subscription.claimableDawn.eq(subscriptionBefore.claimableDawn))
      assert.ok(subscription.dailyUsdc.eq(subscriptionBefore.dailyUsdc))
      assert.equal(subscription.bump, subscriptionBefore.bump)
    })

    test('extends expired subscription', async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))

      // get expiration before extension
      const subscriptionBefore = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      const expirationBefore = new BN(subscriptionBefore.expiration)

      // Advance time to make subscription expired
      const clock = await provider.context.banksClient.getClock()
      const expiredTime = expirationBefore.add(new BN(86400)) // 1 day after expiration
      provider.context.setClock(
        new Clock(
          clock.slot,
          clock.epochStartTimestamp,
          clock.epoch,
          clock.leaderScheduleEpoch,
          BigInt(expiredTime.toString()),
        ),
      )

      const testerUsdcBalanceBefore = await getBalance(
        provider.connection,
        mock.customerUsdcAccount,
      )

      const feePoolDawnBalanceBefore = await getBalance(
        provider.connection,
        mock.feePoolDawnAccount,
      )

      const escrowUsdcBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )

      const escrowDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
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

      // Calculate fee amounts for assertions later
      const config2 = await program.account.config.fetch(mock.configPda)
      const totalFeeBps2 = config2.daoFee
        .add(config2.validatorFee)
        .add(config2.medallionFee)
      const totalFeeUsdc2 = plan.price.mul(totalFeeBps2).div(BPS_DENOMINATOR)
      const remainder2 = plan.price.sub(totalFeeUsdc2)
      const dailyUsdc2 = remainder2.div(new BN(plan.duration))
      const usdcToSwap2 = totalFeeUsdc2.add(dailyUsdc2)

      // Use plan.price for minDawnOut - program will scale it proportionally
      const minDawnOut = calculateMinDawnOut(plan.price, price)
      const deadline = await getDeadline(provider)

      const tx = await program.methods
        .extendSubscription(minDawnOut, deadline)
        .accounts(accounts)
        .signers([mock.customer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<SubscriptionExtended>(
        program,
        txDetails,
        'subscriptionExtended',
      )
      assert.ok(event.subscription.equals(mock.subscriptionPda))
      assert.ok(event.plan.equals(mock.planPda))
      assert.ok(event.subscriber.equals(mock.customer.publicKey))
      expect(event.device).toBeNull()
      assert.ok(
        event.expiration.eq(
          expiredTime.add(new BN(plan.duration * SECONDS_PER_DAY)),
        ),
      )
      // swapPrice is now the actual DAWN output (not Q32 price)
      // For expired subscriptions, swapPrice should be > 0 (swap occurs)
      const swapPriceBN = new BN(event.swapPrice.toString())
      assert.ok(
        swapPriceBN.gt(new BN(0)),
        'swapPrice should be greater than 0 for expired subscriptions',
      )
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure the customer USDC account was debited
      const testerUsdcBalanceAfter = await getBalance(
        provider.connection,
        mock.customerUsdcAccount,
      )
      assert.ok(testerUsdcBalanceAfter.lt(testerUsdcBalanceBefore))

      // make sure the amount debited is the plan price with 0.25% tolerance (to account for slippage)
      const diff = testerUsdcBalanceBefore.sub(testerUsdcBalanceAfter)
      assert.ok(diff.gte(plan.price.mul(TOLERANCE_BPS).div(BPS_DENOMINATOR)))

      // calculate total fee in USDC
      const totalFeeBpsAssert2 = mock.daoFee
        .add(mock.validatorFee)
        .add(mock.medallionFee)
      const totalUsdcFee = plan.price
        .mul(totalFeeBpsAssert2)
        .div(BPS_DENOMINATOR)

      // For expired subscriptions: fees are swapped immediately, remainder goes to escrow
      const escrowUsdcBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )
      const escrowDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )

      const usdcRemainder = plan.price.sub(totalUsdcFee)
      const dailyUsdcAssert2 = usdcRemainder.div(new BN(plan.duration))
      const usdcExpected = usdcRemainder.sub(dailyUsdcAssert2)
      assert.ok(
        escrowUsdcBalanceAfter.sub(escrowUsdcBalanceBefore).eq(usdcExpected),
        'Escrow USDC should increase by remainder after fees for expired subscriptions',
      )

      // swapPriceBN is the actual DAWN output from the swap - calculate exact expected escrow
      // escrow_dawn = (actual_dawn_out * daily_usdc) / total_usdc
      const expectedEscrowDawn = swapPriceBN
        .mul(dailyUsdcAssert2)
        .div(usdcToSwap2)

      const actualEscrowDawn = escrowDawnBalanceAfter.sub(
        escrowDawnBalanceBefore,
      )
      assert.ok(
        actualEscrowDawn.eq(expectedEscrowDawn),
        `Escrow DAWN ${actualEscrowDawn.toString()} should equal ${expectedEscrowDawn.toString()}`,
      )

      // Calculate exact expected fee: total_dawn_fee = actual_dawn_out - escrow_dawn
      const expectedFeeDawn = swapPriceBN.sub(expectedEscrowDawn)

      // make sure the DAO DAWN account was credited with fees
      const feePoolDawnBalanceAfter = await getBalance(
        provider.connection,
        mock.feePoolDawnAccount,
      )
      const actualFeeDeposited = feePoolDawnBalanceAfter.sub(
        feePoolDawnBalanceBefore,
      )

      assert.ok(
        actualFeeDeposited.eq(expectedFeeDawn),
        `Fee ${actualFeeDeposited.toString()} should equal ${expectedFeeDawn.toString()}`,
      )

      // get block time, and calculate expected expiration
      const planInSeconds = plan.duration * SECONDS_PER_DAY
      const expiration = expiredTime.add(new BN(planInSeconds))

      // make sure the subscription expiration was extended
      let subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      assert.ok(subscription.expiration.eq(expiration))

      // make sure other subscription fields
      expect(subscription.createdAt.eq(subscriptionBefore.createdAt))
      assert.ok(subscription.plan.equals(subscriptionBefore.plan))
      assert.ok(subscription.subscriber.equals(subscriptionBefore.subscriber))
      expect(subscription.device).toBeNull()
      // For expired subscriptions, last_claim should be reset to current time
      const currentClock = await provider.context.banksClient.getClock()
      assert.ok(
        subscription.lastClaim.eq(
          new BN(currentClock.unixTimestamp.toString()),
        ),
      )
      // claimableDawn should increase for expired subscriptions
      assert.ok(
        subscription.claimableDawn.gte(subscriptionBefore.claimableDawn),
      )
      assert.equal(subscription.bump, subscriptionBefore.bump)
    })

    test('cannot subscribe to the same plan twice', async () => {
      // Calculate valid minDawnOut for this test (expects duplicate subscription error)
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
      const plan = await program.account.plan.fetch(mock.planPda)
      // Use plan.price for minDawnOut - program will scale it proportionally
      const minDawnOut = calculateMinDawnOut(plan.price, price)

      try {
        const deadline = await getDeadline(provider)

        await program.methods
          .subscribe(minDawnOut, deadline)
          .accounts(accounts)
          .signers([mock.customer])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof SendTransactionError)
        const err: SendTransactionError = error
        const msg = `Allocate: account Address { address: ${mock.subscriptionPda.toBase58()}, base: None } already in use`
        const alreadySubscribed = err.logs.find((log) => log.includes(msg))
        assert.ok(alreadySubscribed)
      }
    })

    test('subscribes to the same plan by another user', async () => {
      const [subscriptionPda] = getSubscriptionPda(
        program,
        mock.planPda,
        wallet.payer,
      )

      provider.wallet = new Wallet(wallet.payer)

      // add device
      const macAddress = [1, 0, 1, 0, 1, 0] as MacAddress
      const devicePda = getDevicePda(
        program,
        wallet.payer,
        mock.deviceModelPda,
        mock.deviceName,
        macAddress,
      )

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)
      const localDomainPda = getLocalDomainPda(
        program,
        wallet.publicKey,
        mock.localDomain,
      )

      const loopbackIpLeasePda = getIpLeasePda(1, devicePda)

      await program.methods
        .addDevice(
          mock.deviceName,
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.devicePlacement,
          macAddress,
          mock.localDomain,
        )
        .accountsPartial({
          caller: wallet.publicKey,
          deviceModel: mock.deviceModelPda,
          device: devicePda,
          deviceLocation: deviceLocationPda,
          localDomain: localDomainPda,
        })
        .signers([wallet.payer])
        .rpc()

      // Calculate valid minDawnOut
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
      const planAccount = await program.account.plan.fetch(mock.planPda)
      // Use plan.price for minDawnOut - program will scale it proportionally
      const minDawnOut = calculateMinDawnOut(planAccount.price, price)
      const deadline = await getDeadline(provider)

      const tx = await program.methods
        .subscribe(minDawnOut, deadline)
        .accountsPartial({
          ...accounts,
          caller: wallet.publicKey,
          device: devicePda,
          subscription: subscriptionPda,
          userDawnAccount: mock.walletDawnAccount,
          userUsdcAccount: mock.walletUsdcAccount,
          escrowUsdcVault: mock.escrowUsdcVault,
          escrowDawnVault: mock.escrowDawnVault,
        })
        .signers([wallet.payer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<Subscribed>(program, txDetails, 'subscribed')
      assert.ok(event.subscription.equals(subscriptionPda))
      assert.ok(event.plan.equals(mock.planPda))
      assert.ok(event.subscriber.equals(wallet.publicKey))
      expect(event.device).toStrictEqual(devicePda)
      assert.ok(event.expiration > 0)
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure the device was assigned to the subscription
      let subscription = await program.account.subscription.fetch(
        subscriptionPda,
      )
      expect(subscription.device).toStrictEqual(devicePda)

      // reset provider wallet
      provider.wallet = new Wallet(mock.customer)
    })

    // Define beneficiary for subscribe_for and extend_subscription_for tests
    let beneficiaryKeypair: anchor.web3.Keypair
    let beneficiary: PublicKey

    describe('subscribe_for', () => {
      test('caller can buy subscription for beneficiary without device', async () => {
        // Initialize beneficiary on first use
        if (!beneficiaryKeypair) {
          beneficiaryKeypair = anchor.web3.Keypair.generate()
          beneficiary = beneficiaryKeypair.publicKey
        }
        // Setup: wallet.payer is the caller
        const caller = wallet.payer

        // Get subscription PDA for beneficiary
        const [subscriptionForPda] = getSubscriptionPda(
          program,
          mock.planPda,
          beneficiaryKeypair,
        )

        // Set wallet to caller (who will pay)
        provider.wallet = new Wallet(caller)

        // Get balances before
        const callerUsdcBalanceBefore = await getBalance(
          provider.connection,
          mock.walletUsdcAccount,
        )

        // Calculate valid minDawnOut
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
        const plan = await program.account.plan.fetch(mock.planPda)
        // Use plan.price for minDawnOut - program will scale it proportionally
        const minDawnOut = calculateMinDawnOut(plan.price, price)
        const deadline = await getDeadline(provider)

        try {
          const tx = await program.methods
            .subscribeFor(minDawnOut, deadline)
            .accountsPartial({
              caller: caller.publicKey,
              beneficiary: beneficiary,
              config: mock.configPda,
              plan: mock.planPda,
              device: null,
              subscription: subscriptionForPda,
              usdcMint: mock.usdcMint,
              dawnMint: mock.dawnMint,
              raydium: mock.raydium,
              raydiumAuthority: mock.raydiumAuthority,
              raydiumConfig: mock.raydiumConfig,
              raydiumPool: mock.raydiumPool,
              raydiumObservation: mock.raydiumObservation,
              raydiumDawnVault: mock.raydiumDawnVault,
              raydiumUsdcVault: mock.raydiumUsdcVault,
              userUsdcAccount: mock.walletUsdcAccount,
              userDawnAccount: mock.walletDawnAccount,
              feePoolDawnAccount: mock.feePoolDawnAccount,
              escrowUsdcVault: mock.escrowUsdcVault,
              escrowDawnVault: mock.escrowDawnVault,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([caller])
            .transaction()

          const txDetails = await confirmTx(provider, tx)

          // Verify event
          const event = await getEvent<Subscribed>(
            program,
            txDetails,
            'subscribed',
          )
          assert.ok(event.subscription.equals(subscriptionForPda))
          assert.ok(event.plan.equals(mock.planPda))
          assert.ok(
            event.subscriber.equals(beneficiary),
            'Subscriber should be beneficiary',
          )
          expect(event.device).toBeNull()
          assert.ok(event.expiration > 0)

          // Verify caller's USDC was debited
          const callerUsdcBalanceAfter = await getBalance(
            provider.connection,
            mock.walletUsdcAccount,
          )
          assert.ok(
            callerUsdcBalanceAfter.lt(callerUsdcBalanceBefore),
            'Caller USDC should be debited',
          )

          // Verify subscription was created for beneficiary
          const subscription = await program.account.subscription.fetch(
            subscriptionForPda,
          )
          assert.ok(
            subscription.subscriber.equals(beneficiary),
            'Subscription subscriber should be beneficiary',
          )
          expect(subscription.device).toBeNull()
        } catch (error) {
          console.error('subscribe_for error:', error)
          throw error
        } finally {
          // Reset provider wallet
          provider.wallet = new Wallet(mock.customer)
        }
      })

      test('cannot subscribe_for with device owned by caller', async () => {
        // Try to create a different subscription with a device owned by caller (should fail)
        const anotherBeneficiary = anchor.web3.Keypair.generate()
        const caller = wallet.payer

        // Get device owned by caller (wallet.payer)
        const macAddress = [1, 0, 1, 0, 1, 0] as MacAddress
        const devicePda = getDevicePda(
          program,
          wallet.payer,
          mock.deviceModelPda,
          mock.deviceName,
          macAddress,
        )

        const [subscriptionForPda] = getSubscriptionPda(
          program,
          mock.planPda,
          anotherBeneficiary,
        )

        provider.wallet = new Wallet(caller)

        // Calculate valid minDawnOut
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
        const plan = await program.account.plan.fetch(mock.planPda)
        // Use plan.price for minDawnOut - program will scale it proportionally
        const minDawnOut = calculateMinDawnOut(plan.price, price)
        const deadline = await getDeadline(provider)

        try {
          await program.methods
            .subscribeFor(minDawnOut, deadline)
            .accountsPartial({
              caller: caller.publicKey,
              beneficiary: anotherBeneficiary.publicKey,
              config: mock.configPda,
              plan: mock.planPda,
              device: devicePda, // Device owned by caller, not beneficiary
              subscription: subscriptionForPda,
              usdcMint: mock.usdcMint,
              dawnMint: mock.dawnMint,
              raydium: mock.raydium,
              raydiumAuthority: mock.raydiumAuthority,
              raydiumConfig: mock.raydiumConfig,
              raydiumPool: mock.raydiumPool,
              raydiumObservation: mock.raydiumObservation,
              raydiumDawnVault: mock.raydiumDawnVault,
              raydiumUsdcVault: mock.raydiumUsdcVault,
              userUsdcAccount: mock.walletUsdcAccount,
              userDawnAccount: mock.walletDawnAccount,
              feePoolDawnAccount: mock.feePoolDawnAccount,
              escrowUsdcVault: mock.escrowUsdcVault,
              escrowDawnVault: mock.escrowDawnVault,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([caller])
            .rpc()
          assert.ok(
            false,
            'Should have failed with device ownership constraint',
          )
        } catch (error) {
          assert.ok(error instanceof AnchorError)
          const err: AnchorError = error
          // Device ownership constraint should fail
          assert.ok(err.error.errorMessage.includes('constraint'))
        } finally {
          provider.wallet = new Wallet(mock.customer)
        }
      })
    })

    describe('extend_subscription_for', () => {
      test('caller can extend subscription for beneficiary', async () => {
        const caller = wallet.payer

        // Get subscription PDA for beneficiary (created in previous test)
        const [subscriptionForPda] = getSubscriptionPda(
          program,
          mock.planPda,
          beneficiaryKeypair,
        )

        // Get subscription before extension
        const subscriptionBefore = await program.account.subscription.fetch(
          subscriptionForPda,
        )
        const expirationBefore = new BN(subscriptionBefore.expiration)

        // Set wallet to caller (who will pay)
        provider.wallet = new Wallet(caller)

        // Get balances before
        const callerUsdcBalanceBefore = await getBalance(
          provider.connection,
          mock.walletUsdcAccount,
        )

        // Calculate valid minDawnOut
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
        const config = await program.account.config.fetch(mock.configPda)
        const plan = await program.account.plan.fetch(mock.planPda)
        const totalFeeBps = config.daoFee
          .add(config.validatorFee)
          .add(config.medallionFee)
        const totalFeeUsdc = plan.price.mul(totalFeeBps).div(BPS_DENOMINATOR)
        const remainder = plan.price.sub(totalFeeUsdc)
        const dailyUsdc = remainder.div(new BN(plan.duration))

        // For active extensions: provide minDawnOut for full plan.price
        // Code will scale it down for fee-only swap
        const minDawnOut = calculateMinDawnOut(plan.price, price)
        const deadline = await getDeadline(provider)

        const tx = await program.methods
          .extendSubscriptionFor(minDawnOut, deadline)
          .accountsPartial({
            caller: caller.publicKey,
            beneficiary: beneficiary,
            config: mock.configPda,
            plan: mock.planPda,
            subscription: subscriptionForPda,
            usdcMint: mock.usdcMint,
            dawnMint: mock.dawnMint,
            raydium: mock.raydium,
            raydiumAuthority: mock.raydiumAuthority,
            raydiumConfig: mock.raydiumConfig,
            raydiumPool: mock.raydiumPool,
            raydiumObservation: mock.raydiumObservation,
            raydiumDawnVault: mock.raydiumDawnVault,
            raydiumUsdcVault: mock.raydiumUsdcVault,
            userUsdcAccount: mock.walletUsdcAccount,
            userDawnAccount: mock.walletDawnAccount,
            feePoolDawnAccount: mock.feePoolDawnAccount,
            escrowUsdcVault: mock.escrowUsdcVault,
            escrowDawnVault: mock.escrowDawnVault,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([caller])
          .transaction()

        const txDetails = await confirmTx(provider, tx)

        // Verify event
        const event = await getEvent<SubscriptionExtended>(
          program,
          txDetails,
          'subscriptionExtended',
        )
        assert.ok(event.subscription.equals(subscriptionForPda))
        assert.ok(event.plan.equals(mock.planPda))
        assert.ok(
          event.subscriber.equals(beneficiary),
          'Subscriber should be beneficiary',
        )
        assert.ok(
          event.expiration.eq(
            expirationBefore.add(new BN(plan.duration * SECONDS_PER_DAY)),
          ),
          'Expiration should be extended by plan duration',
        )

        // Verify caller's USDC was debited
        const callerUsdcBalanceAfter = await getBalance(
          provider.connection,
          mock.walletUsdcAccount,
        )
        assert.ok(
          callerUsdcBalanceAfter.lt(callerUsdcBalanceBefore),
          'Caller USDC should be debited',
        )

        // Verify subscription was extended
        const subscriptionAfter = await program.account.subscription.fetch(
          subscriptionForPda,
        )
        assert.ok(
          subscriptionAfter.expiration.eq(
            expirationBefore.add(new BN(plan.duration * SECONDS_PER_DAY)),
          ),
          'Subscription expiration should be extended',
        )
        assert.ok(
          subscriptionAfter.subscriber.equals(beneficiary),
          'Subscriber should still be beneficiary',
        )

        // Reset provider wallet
        provider.wallet = new Wallet(mock.customer)
      })

      test('cannot extend subscription for wrong beneficiary', async () => {
        const wrongBeneficiary = anchor.web3.Keypair.generate().publicKey
        const caller = wallet.payer

        // Get subscription PDA for the actual beneficiary
        const [subscriptionForPda] = getSubscriptionPda(
          program,
          mock.planPda,
          beneficiaryKeypair,
        )

        provider.wallet = new Wallet(caller)

        // Calculate valid minDawnOut
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
        const plan = await program.account.plan.fetch(mock.planPda)
        // Use plan.price for minDawnOut - program will scale it proportionally
        const minDawnOut = calculateMinDawnOut(plan.price, price)
        const deadline = await getDeadline(provider)

        try {
          await program.methods
            .extendSubscriptionFor(minDawnOut, deadline)
            .accountsPartial({
              caller: caller.publicKey,
              beneficiary: wrongBeneficiary, // Wrong beneficiary
              config: mock.configPda,
              plan: mock.planPda,
              subscription: subscriptionForPda, // Subscription belongs to mock.customer
              usdcMint: mock.usdcMint,
              dawnMint: mock.dawnMint,
              raydium: mock.raydium,
              raydiumAuthority: mock.raydiumAuthority,
              raydiumConfig: mock.raydiumConfig,
              raydiumPool: mock.raydiumPool,
              raydiumObservation: mock.raydiumObservation,
              raydiumDawnVault: mock.raydiumDawnVault,
              raydiumUsdcVault: mock.raydiumUsdcVault,
              userUsdcAccount: mock.walletUsdcAccount,
              userDawnAccount: mock.walletDawnAccount,
              feePoolDawnAccount: mock.feePoolDawnAccount,
              escrowUsdcVault: mock.escrowUsdcVault,
              escrowDawnVault: mock.escrowDawnVault,
              tokenProgram: TOKEN_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([caller])
            .rpc()
          assert.ok(false, 'Should have failed with wrong beneficiary')
        } catch (error) {
          assert.ok(error instanceof AnchorError)
          const err: AnchorError = error
          // Should fail with Unauthorized or constraint error
          assert.ok(
            err.error.errorMessage.includes('Unauthorized') ||
              err.error.errorMessage.includes('constraint'),
            'Should fail with Unauthorized or constraint error',
          )
        } finally {
          provider.wallet = new Wallet(mock.customer)
        }
      })
    })
  })
