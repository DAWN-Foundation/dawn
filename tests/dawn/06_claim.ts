import * as anchor from '@coral-xyz/anchor'
import { Program, BN, Wallet, AnchorError } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

import { Dawn } from '../../target/types/dawn'
import {
  getEvent,
  mock,
  getProvider,
  confirmTx,
  getPlanPda,
  getSubscriptionPda,
  claimTx,
  claimRpc,
} from '../../sdk/utils'
import { BankrunProvider } from 'anchor-bankrun'
import { Clock } from 'solana-bankrun'
import { beforeAll, expect } from '@jest/globals'
import { getBalance } from '../../cli/shared/cli-utils'

const SECONDS_PER_DAY = 86_400n
const BPS_DENOMINATOR = new BN(10_000)
const SLIPPAGE_BPS = new BN(9900)

const Q32 = new BN(2).pow(new BN(32))

/**
 * Helper function to calculate minDawnOut with slippage tolerance
 *
 * @param stableAmount - Amount of USD.tel to swap
 * @param price - Current pool price (Q32 format)
 * @param slippageBps - Slippage tolerance in basis points (default: 500 = 5%)
 *                      Can be 0-500 bps (0%-5%) to match program validation
 *                      The program enforces MAX_SLIPPAGE_TOLERANCE_BPS = 500
 *
 * @returns Minimum DAWN output that will be accepted
 */
function calculateMinDawnOut(
  stableAmount: BN,
  price: BN,
  slippageBps: number = 500,
): BN {
  // expectedOut = (stableAmount * price) / Q32
  const expectedOut = stableAmount.mul(price).div(Q32)
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
async function getDeadline(provider: BankrunProvider): Promise<BN> {
  const clock = await provider.context.banksClient.getClock()
  const currentTime = clock.unixTimestamp
  return new BN(currentTime.toString()).add(new BN(30))
}

interface Claimed {
  subscription: PublicKey
  plan: PublicKey
  swapPrice: BN
  dawnClaimed: BN
}

export const claimTests = () =>
  describe('dawn::claim', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>

    let plan: Awaited<ReturnType<typeof program.account.plan.fetch>>
    let subscription: Awaited<
      ReturnType<typeof program.account.subscription.fetch>
    >
    let accounts: Record<string, PublicKey>

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.serviceProvider)
      anchor.setProvider(provider)

      program = anchor.workspace.DAWN as Program<Dawn>

      const planAccount = await provider.context.banksClient.getAccount(
        mock.planPda,
      )
      plan = program.coder.accounts.decode(
        'plan',
        Buffer.from(planAccount.data),
      )

      const subscriptionAccount = await provider.context.banksClient.getAccount(
        mock.subscriptionPda,
      )
      subscription = program.coder.accounts.decode(
        'subscription',
        Buffer.from(subscriptionAccount.data),
      )

      // accounts for a successful subscription
      accounts = {
        caller: mock.serviceProvider.publicKey,
        config: mock.configPda,
        plan: mock.planPda,
        subscription: mock.subscriptionPda,
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
        escrowStableVault: mock.escrowStableVault,
        escrowDawnVault: mock.escrowDawnVault,
        serviceProviderDawnAccount: mock.serviceProviderDawnAccount,
        // programs
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }
    })

    test('mock setup', () => {
      assert.exists(mock)
      assert.exists(plan)
      assert.exists(subscription)
      assert.ok(plan.owner.equals(mock.serviceProvider.publicKey))
      assert.exists(accounts)
    })

    test('cannot claim before the next day', async () => {
      // Calculate valid minDawnOut (expects claim too early error, not validation error)
      const subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      const raydiumDawnVault = await getAccount(
        provider.connection,
        accounts.raydiumDawnVault,
      )
      const raydiumStableVault = await getAccount(
        provider.connection,
        accounts.raydiumStableVault,
      )
      const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
      const stableVaultAmount = new BN(raydiumStableVault.amount.toString())
      const price = dawnVaultAmount.mul(Q32).div(stableVaultAmount)
      const minDawnOut = calculateMinDawnOut(subscription.dailyStable, price) // Uses default 500 bps

      try {
        const deadline = await getDeadline(provider)

        await claimRpc({
          program,
          minDawnOut,
          deadline,
          caller: accounts.caller,
          signer: mock.serviceProvider,
          config: accounts.config,
          plan: accounts.plan,
          subscription: accounts.subscription,
          stableMint: accounts.stableMint,
          dawnMint: accounts.dawnMint,
          raydium: accounts.raydium,
          raydiumAuthority: accounts.raydiumAuthority,
          raydiumConfig: accounts.raydiumConfig,
          raydiumPool: accounts.raydiumPool,
          raydiumObservation: accounts.raydiumObservation,
          raydiumDawnVault: accounts.raydiumDawnVault,
          raydiumStableVault: accounts.raydiumStableVault,
          escrowStableVault: accounts.escrowStableVault,
          escrowDawnVault: accounts.escrowDawnVault,
          serviceProviderDawnAccount: accounts.serviceProviderDawnAccount,
          tokenProgram: accounts.tokenProgram,
          associatedTokenProgram: accounts.associatedTokenProgram,
          systemProgram: accounts.systemProgram,
        })

        expect(false).toBeTruthy()
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Claim too early')
      }
    })

    test('cannot claim from escrow of a plan that doesnt exist', async () => {
      const [badPlanPda] = getPlanPda(
        program,
        mock.serviceProvider.publicKey,
        mock.localDomainPda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [badSubscriptionPda] = getSubscriptionPda(
        program,
        badPlanPda,
        mock.serviceProvider,
      )

      // Calculate valid minDawnOut (expects account error, not validation error)
      const subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      const raydiumDawnVault = await getAccount(
        provider.connection,
        accounts.raydiumDawnVault,
      )
      const raydiumStableVault = await getAccount(
        provider.connection,
        accounts.raydiumStableVault,
      )
      const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
      const stableVaultAmount = new BN(raydiumStableVault.amount.toString())
      const price = dawnVaultAmount.mul(Q32).div(stableVaultAmount)
      const minDawnOut = calculateMinDawnOut(subscription.dailyStable, price) // Uses default 500 bps

      try {
        const deadline = await getDeadline(provider)

        await claimRpc({
          program,
          minDawnOut,
          deadline,
          caller: accounts.caller,
          signer: mock.serviceProvider,
          config: accounts.config,
          plan: badPlanPda,
          subscription: badSubscriptionPda,
          stableMint: accounts.stableMint,
          dawnMint: accounts.dawnMint,
          raydium: accounts.raydium,
          raydiumAuthority: accounts.raydiumAuthority,
          raydiumConfig: accounts.raydiumConfig,
          raydiumPool: accounts.raydiumPool,
          raydiumObservation: accounts.raydiumObservation,
          raydiumDawnVault: accounts.raydiumDawnVault,
          raydiumStableVault: accounts.raydiumStableVault,
          escrowStableVault: accounts.escrowStableVault,
          escrowDawnVault: accounts.escrowDawnVault,
          serviceProviderDawnAccount: accounts.serviceProviderDawnAccount,
          tokenProgram: accounts.tokenProgram,
          associatedTokenProgram: accounts.associatedTokenProgram,
          systemProgram: accounts.systemProgram,
        })
        expect(false).toBeTruthy()
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(
          err.error.errorMessage,
          'The program expected this account to be already initialized',
        )
      }
    })

    test('cannot claim from escrow of a plan that is not owned by the caller', async () => {
      provider.wallet = new Wallet(mock.customer)

      // Calculate valid minDawnOut (expects authorization error, not validation error)
      const subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      const raydiumDawnVault = await getAccount(
        provider.connection,
        accounts.raydiumDawnVault,
      )
      const raydiumStableVault = await getAccount(
        provider.connection,
        accounts.raydiumStableVault,
      )
      const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
      const stableVaultAmount = new BN(raydiumStableVault.amount.toString())
      const price = dawnVaultAmount.mul(Q32).div(stableVaultAmount)
      const minDawnOut = calculateMinDawnOut(subscription.dailyStable, price) // Uses default 500 bps

      try {
        const deadline = await getDeadline(provider)

        await claimRpc({
          program,
          minDawnOut,
          deadline,
          caller: mock.customer.publicKey,
          signer: mock.customer,
          config: accounts.config,
          plan: accounts.plan,
          subscription: accounts.subscription,
          stableMint: accounts.stableMint,
          dawnMint: accounts.dawnMint,
          raydium: accounts.raydium,
          raydiumAuthority: accounts.raydiumAuthority,
          raydiumConfig: accounts.raydiumConfig,
          raydiumPool: accounts.raydiumPool,
          raydiumObservation: accounts.raydiumObservation,
          raydiumDawnVault: accounts.raydiumDawnVault,
          raydiumStableVault: accounts.raydiumStableVault,
          escrowStableVault: accounts.escrowStableVault,
          escrowDawnVault: accounts.escrowDawnVault,
          serviceProviderDawnAccount: accounts.serviceProviderDawnAccount,
          tokenProgram: accounts.tokenProgram,
          associatedTokenProgram: accounts.associatedTokenProgram,
          systemProgram: accounts.systemProgram,
        })
        expect(false).toBeTruthy()
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('A raw constraint was violated')
      }
    })

    test('claims daily DAWN', async () => {
      // get balances of escrow USD.tel vault BEFORE claim
      const escrowStableBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowStableVault,
      )

      // get balance of escrow DAWN vault BEFORE claim
      const escrowDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )

      const serviceProviderDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.serviceProviderDawnAccount,
      )

      // get balances of raydium vaults (for calculating minDawnOut)
      const raydiumDawnVault = await getAccount(
        provider.connection,
        accounts.raydiumDawnVault,
      )
      const raydiumStableVault = await getAccount(
        provider.connection,
        accounts.raydiumStableVault,
      )

      const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
      const stableVaultAmount = new BN(raydiumStableVault.amount.toString())
      const price = dawnVaultAmount.mul(Q32).div(stableVaultAmount)

      // forward time to the next day
      const clock = await provider.context.banksClient.getClock()
      provider.context.setClock(
        new Clock(
          clock.slot,
          clock.epochStartTimestamp,
          clock.epoch,
          clock.leaderScheduleEpoch,
          clock.unixTimestamp + SECONDS_PER_DAY,
        ),
      )

      // Calculate valid minDawnOut for testing (uses default 500 bps = 5% slippage)
      const subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      const minDawnOut = calculateMinDawnOut(subscription.dailyStable, price) // Uses default 500 bps
      const deadline = await getDeadline(provider)

      const tx = await claimTx({
        program,
        minDawnOut,
        deadline,
        caller: accounts.caller,
        signer: mock.serviceProvider,
        config: accounts.config,
        plan: accounts.plan,
        subscription: accounts.subscription,
        stableMint: accounts.stableMint,
        dawnMint: accounts.dawnMint,
        raydium: accounts.raydium,
        raydiumAuthority: accounts.raydiumAuthority,
        raydiumConfig: accounts.raydiumConfig,
        raydiumPool: accounts.raydiumPool,
        raydiumObservation: accounts.raydiumObservation,
        raydiumDawnVault: accounts.raydiumDawnVault,
        raydiumStableVault: accounts.raydiumStableVault,
        escrowStableVault: accounts.escrowStableVault,
        escrowDawnVault: accounts.escrowDawnVault,
        serviceProviderDawnAccount: accounts.serviceProviderDawnAccount,
        tokenProgram: accounts.tokenProgram,
        associatedTokenProgram: accounts.associatedTokenProgram,
        systemProgram: accounts.systemProgram,
      })

      provider.wallet = new Wallet(mock.serviceProvider)

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<Claimed>(program, txDetails, 'claimed')
      expect(event.subscription.equals(mock.subscriptionPda)).toBeTruthy()
      expect(event.plan.equals(mock.planPda)).toBeTruthy()
      // swapPrice is now the actual DAWN output (not Q32 price)
      const swapPriceBN = new BN(event.swapPrice.toString())
      expect(swapPriceBN.gt(new BN(0))).toBeTruthy()
      expect(event.dawnClaimed.eq(subscription.claimableDawn)).toBeTruthy()

      // make sure the service provider DAWN account was credited with the claimable DAWN amount
      const serviceProviderDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.serviceProviderDawnAccount,
      )
      expect(
        serviceProviderDawnBalanceAfter
          .sub(serviceProviderDawnBalanceBefore)
          .eq(subscription.claimableDawn),
      ).toBeTruthy()

      // make sure the escrow USD.tel vault was debited by the daily USD.tel amount
      const escrowStableBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowStableVault,
      )
      const actualDebit = escrowStableBalanceBefore.sub(escrowStableBalanceAfter)

      // Verify amount debited - should be daily USD.tel (or less if remaining escrow is lower)
      // event.swapPrice contains the actual DAWN received from the swap
      expect(actualDebit.gte(new BN(0))).toBeTruthy()
      expect(actualDebit.lte(subscription.dailyStable)).toBeTruthy()

      // make sure the escrow DAWN vault was credited by the actual swap amount
      const escrowDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )

      // Calculate actual DAWN deposited from swap:
      // final_balance = initial_balance - claimable_dawn (transferred out) + swap_output
      // Therefore: swap_output = final_balance - initial_balance + claimable_dawn
      const actualDawnDeposited = escrowDawnBalanceAfter
        .sub(escrowDawnBalanceBefore)
        .add(subscription.claimableDawn)

      // The actual DAWN deposited should equal the swap output from the event
      expect(actualDawnDeposited.eq(swapPriceBN)).toBeTruthy()

      // make sure the subscription was updated with the exact amount from the swap
      const sub = await program.account.subscription.fetch(mock.subscriptionPda)
      expect(sub.claimableDawn.eq(swapPriceBN)).toBeTruthy()
    })

    test('cannot claim again right away before the next day', async () => {
      // small wait to make sure the last claim is updated
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Calculate valid minDawnOut (expects claim too early error, not validation error)
      const subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      const raydiumDawnVault = await getAccount(
        provider.connection,
        accounts.raydiumDawnVault,
      )
      const raydiumStableVault = await getAccount(
        provider.connection,
        accounts.raydiumStableVault,
      )
      const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
      const stableVaultAmount = new BN(raydiumStableVault.amount.toString())
      const price = dawnVaultAmount.mul(Q32).div(stableVaultAmount)
      const minDawnOut = calculateMinDawnOut(subscription.dailyStable, price) // Uses default 500 bps

      try {
        const deadline = await getDeadline(provider)

        await claimRpc({
          program,
          minDawnOut,
          deadline,
          caller: accounts.caller,
          signer: mock.serviceProvider,
          config: accounts.config,
          plan: accounts.plan,
          subscription: accounts.subscription,
          stableMint: accounts.stableMint,
          dawnMint: accounts.dawnMint,
          raydium: accounts.raydium,
          raydiumAuthority: accounts.raydiumAuthority,
          raydiumConfig: accounts.raydiumConfig,
          raydiumPool: accounts.raydiumPool,
          raydiumObservation: accounts.raydiumObservation,
          raydiumDawnVault: accounts.raydiumDawnVault,
          raydiumStableVault: accounts.raydiumStableVault,
          escrowStableVault: accounts.escrowStableVault,
          escrowDawnVault: accounts.escrowDawnVault,
          serviceProviderDawnAccount: accounts.serviceProviderDawnAccount,
          tokenProgram: accounts.tokenProgram,
          associatedTokenProgram: accounts.associatedTokenProgram,
          systemProgram: accounts.systemProgram,
        })
        expect(false).toBeTruthy()
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Claim too early')
      }
    })

    test('claiming after 3 days should claim previous 1 day, then swap and lock 3 days worth of DAWN', async () => {
      let subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )

      // forward time 3 days
      const clock = await provider.context.banksClient.getClock()
      provider.context.setClock(
        new Clock(
          clock.slot,
          clock.epochStartTimestamp,
          clock.epoch,
          clock.leaderScheduleEpoch,
          clock.unixTimestamp + 3n * SECONDS_PER_DAY,
        ),
      )

      // get balances BEFORE claim
      const escrowStableBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowStableVault,
      )
      const escrowDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )
      const serviceProviderDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.serviceProviderDawnAccount,
      )

      // get balances of raydium vaults
      const raydiumDawnVault = await getAccount(
        provider.connection,
        accounts.raydiumDawnVault,
      )
      const raydiumStableVault = await getAccount(
        provider.connection,
        accounts.raydiumStableVault,
      )

      const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
      const stableVaultAmount = new BN(raydiumStableVault.amount.toString())
      const price = dawnVaultAmount.mul(Q32).div(stableVaultAmount)

      // Calculate valid minDawnOut (uses default 500 bps = 5% slippage)
      subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      const minDawnOut = calculateMinDawnOut(subscription.dailyStable, price) // Uses default 500 bps
      const deadline = await getDeadline(provider)

      const tx = await claimTx({
        program,
        minDawnOut,
        deadline,
        caller: accounts.caller,
        signer: mock.serviceProvider,
        config: accounts.config,
        plan: accounts.plan,
        subscription: accounts.subscription,
        stableMint: accounts.stableMint,
        dawnMint: accounts.dawnMint,
        raydium: accounts.raydium,
        raydiumAuthority: accounts.raydiumAuthority,
        raydiumConfig: accounts.raydiumConfig,
        raydiumPool: accounts.raydiumPool,
        raydiumObservation: accounts.raydiumObservation,
        raydiumDawnVault: accounts.raydiumDawnVault,
        raydiumStableVault: accounts.raydiumStableVault,
        escrowStableVault: accounts.escrowStableVault,
        escrowDawnVault: accounts.escrowDawnVault,
        serviceProviderDawnAccount: accounts.serviceProviderDawnAccount,
        tokenProgram: accounts.tokenProgram,
        associatedTokenProgram: accounts.associatedTokenProgram,
        systemProgram: accounts.systemProgram,
      })

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<Claimed>(program, txDetails, 'claimed')
      expect(event.subscription.equals(mock.subscriptionPda)).toBeTruthy()
      expect(event.plan.equals(mock.planPda)).toBeTruthy()
      // swapPrice is now the actual DAWN output (not Q32 price)
      const swapPriceBN = new BN(event.swapPrice.toString())
      expect(swapPriceBN.gt(new BN(0))).toBeTruthy()
      expect(event.dawnClaimed.eq(subscription.claimableDawn)).toBeTruthy()

      // make sure the service provider DAWN account was credited with the claimable DAWN amount (1 day)
      const serviceProviderDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.serviceProviderDawnAccount,
      )
      expect(
        serviceProviderDawnBalanceAfter
          .sub(serviceProviderDawnBalanceBefore)
          .eq(subscription.claimableDawn),
      ).toBeTruthy()

      // Verify amount debited - should be up to 3 days worth
      const escrowStableBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowStableVault,
      )
      const actualDebit = escrowStableBalanceBefore.sub(escrowStableBalanceAfter)
      const maxThreeDaysStable = subscription.dailyStable.mul(new BN(3))

      // Should debit some amount (actual amount depends on remaining escrow)
      expect(actualDebit.gt(new BN(0))).toBeTruthy()
      expect(actualDebit.lte(maxThreeDaysStable)).toBeTruthy()

      // Verify exact DAWN deposited from swap
      const escrowDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )

      // Calculate actual DAWN deposited from swap:
      // final_balance = initial_balance - claimable_dawn (transferred out) + swap_output
      // Therefore: swap_output = final_balance - initial_balance + claimable_dawn
      const actualDawnDeposited = escrowDawnBalanceAfter
        .sub(escrowDawnBalanceBefore)
        .add(subscription.claimableDawn)

      expect(actualDawnDeposited.eq(swapPriceBN)).toBeTruthy()

      // Verify subscription has exact claimable DAWN from swap
      const sub = await program.account.subscription.fetch(mock.subscriptionPda)
      expect(sub.claimableDawn.eq(swapPriceBN)).toBeTruthy()

      // Verify last claim time was updated
      expect(
        sub.lastClaim.gt(new BN(clock.unixTimestamp.toString())),
      ).toBeTruthy()
    })

    test('claims accumulated 3 days worth of DAWN', async () => {
      let subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )

      // forward time 1 day to unlock claimable_dawn (3 days worth of DAWN)
      const clock = await provider.context.banksClient.getClock()
      provider.context.setClock(
        new Clock(
          clock.slot,
          clock.epochStartTimestamp,
          clock.epoch,
          clock.leaderScheduleEpoch,
          clock.unixTimestamp + SECONDS_PER_DAY,
        ),
      )

      // get balances of service provider DAWN account
      const serviceProviderDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.serviceProviderDawnAccount,
      )

      // get balances of escrow USD.tel vault
      const escrowStableBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowStableVault,
      )

      // get raydium vaults
      const raydiumDawnVault = await getAccount(
        provider.connection,
        accounts.raydiumDawnVault,
      )
      const raydiumStableVault = await getAccount(
        provider.connection,
        accounts.raydiumStableVault,
      )

      const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
      const stableVaultAmount = new BN(raydiumStableVault.amount.toString())
      const price = dawnVaultAmount.mul(Q32).div(stableVaultAmount)

      // Calculate valid minDawnOut (uses default 500 bps = 5% slippage)
      subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      const minDawnOut = calculateMinDawnOut(subscription.dailyStable, price) // Uses default 500 bps
      const deadline = await getDeadline(provider)

      await claimRpc({
        program,
        minDawnOut,
        deadline,
        caller: accounts.caller,
        signer: mock.serviceProvider,
        config: accounts.config,
        plan: accounts.plan,
        subscription: accounts.subscription,
        stableMint: accounts.stableMint,
        dawnMint: accounts.dawnMint,
        raydium: accounts.raydium,
        raydiumAuthority: accounts.raydiumAuthority,
        raydiumConfig: accounts.raydiumConfig,
        raydiumPool: accounts.raydiumPool,
        raydiumObservation: accounts.raydiumObservation,
        raydiumDawnVault: accounts.raydiumDawnVault,
        raydiumStableVault: accounts.raydiumStableVault,
        escrowStableVault: accounts.escrowStableVault,
        escrowDawnVault: accounts.escrowDawnVault,
        serviceProviderDawnAccount: accounts.serviceProviderDawnAccount,
        tokenProgram: accounts.tokenProgram,
        associatedTokenProgram: accounts.associatedTokenProgram,
        systemProgram: accounts.systemProgram,
      })

      // make sure the escrow USD.tel vault was debited by the daily USD.tel amount
      const escrowStableBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowStableVault,
      )
      const actualDebit = escrowStableBalanceBefore.sub(escrowStableBalanceAfter)

      // The amount debited depends on:
      // 1. days_since_claim * daily_stable, or
      // 2. remaining_stable if less than that
      // Since claim only happens once per day, actualDebit should be >= 0 and <= days * dailyStable
      expect(actualDebit.gt(new BN(0))).toBeTruthy() // At least some USD.tel was swapped

      // make sure the service provider DAWN account was credited with the claimable DAWN amount
      const serviceProviderDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.serviceProviderDawnAccount,
      )
      expect(
        serviceProviderDawnBalanceAfter
          .sub(serviceProviderDawnBalanceBefore)
          .eq(subscription.claimableDawn),
      ).toBeTruthy()

      // make sure the escrow DAWN vault was credited by the next daily claimable DAWN amount (1 day)
      const nextDailyDawn = subscription.dailyStable
        .mul(price)
        .div(Q32)
        .mul(SLIPPAGE_BPS)
        .div(BPS_DENOMINATOR)
      const escrowDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )
      expect(escrowDawnBalanceAfter.gte(nextDailyDawn)).toBeTruthy()
    })
  })
