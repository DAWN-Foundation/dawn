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

const Q32 = new BN(2).pow(new BN(32))

/**
 * Helper function to calculate minDawnOut with slippage tolerance
 *
 * @param usdcAmount - Amount of USDC to swap
 * @param price - Current pool price (Q32 format)
 * @param slippageBps - Slippage tolerance in basis points (default: 500 = 5%)
 *
 * @returns Minimum DAWN output that will be accepted
 */
function calculateMinDawnOut(
  usdcAmount: BN,
  price: BN,
  slippageBps: number = 500,
): BN {
  const expectedOut = usdcAmount.mul(price).div(Q32)
  const minOut = expectedOut.mul(new BN(10000 - slippageBps)).div(new BN(10000))
  return minOut
}

/**
 * Helper function to get deadline (30 seconds from now)
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

      accounts = {
        caller: mock.serviceProvider.publicKey,
        config: mock.configPda,
        plan: mock.planPda,
        subscription: mock.subscriptionPda,
        usdcMint: mock.usdcMint,
        dawnMint: mock.dawnMint,
        raydium: mock.raydium,
        raydiumAuthority: mock.raydiumAuthority,
        raydiumConfig: mock.raydiumConfig,
        raydiumPool: mock.raydiumPool,
        raydiumObservation: mock.raydiumObservation,
        raydiumDawnVault: mock.raydiumDawnVault,
        raydiumUsdcVault: mock.raydiumUsdcVault,
        escrowUsdcVault: mock.escrowUsdcVault,
        escrowDawnVault: mock.escrowDawnVault,
        serviceProviderDawnAccount: mock.serviceProviderDawnAccount,
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

    test('cannot claim before subscription expires', async () => {
      const escrowUsdcBalance = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )

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
      const minDawnOut = calculateMinDawnOut(escrowUsdcBalance, price)

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
          usdcMint: accounts.usdcMint,
          dawnMint: accounts.dawnMint,
          raydium: accounts.raydium,
          raydiumAuthority: accounts.raydiumAuthority,
          raydiumConfig: accounts.raydiumConfig,
          raydiumPool: accounts.raydiumPool,
          raydiumObservation: accounts.raydiumObservation,
          raydiumDawnVault: accounts.raydiumDawnVault,
          raydiumUsdcVault: accounts.raydiumUsdcVault,
          escrowUsdcVault: accounts.escrowUsdcVault,
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
        expect(err.error.errorMessage).toBe('Subscription not expired')
      }
    })

    test('cannot claim from escrow of a plan that doesnt exist', async () => {
      const [badPlanPda] = getPlanPda(
        program,
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

      const escrowUsdcBalance = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )
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
      const minDawnOut = calculateMinDawnOut(escrowUsdcBalance, price)

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
          usdcMint: accounts.usdcMint,
          dawnMint: accounts.dawnMint,
          raydium: accounts.raydium,
          raydiumAuthority: accounts.raydiumAuthority,
          raydiumConfig: accounts.raydiumConfig,
          raydiumPool: accounts.raydiumPool,
          raydiumObservation: accounts.raydiumObservation,
          raydiumDawnVault: accounts.raydiumDawnVault,
          raydiumUsdcVault: accounts.raydiumUsdcVault,
          escrowUsdcVault: accounts.escrowUsdcVault,
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

      const escrowUsdcBalance = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )
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
      const minDawnOut = calculateMinDawnOut(escrowUsdcBalance, price)

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
          usdcMint: accounts.usdcMint,
          dawnMint: accounts.dawnMint,
          raydium: accounts.raydium,
          raydiumAuthority: accounts.raydiumAuthority,
          raydiumConfig: accounts.raydiumConfig,
          raydiumPool: accounts.raydiumPool,
          raydiumObservation: accounts.raydiumObservation,
          raydiumDawnVault: accounts.raydiumDawnVault,
          raydiumUsdcVault: accounts.raydiumUsdcVault,
          escrowUsdcVault: accounts.escrowUsdcVault,
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

    test('claims full USDC after subscription expires and locks DAWN', async () => {
      const escrowUsdcBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )

      const escrowDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )

      const serviceProviderDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.serviceProviderDawnAccount,
      )

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

      // Forward time past subscription expiration
      const subscriptionData = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      const expiration = subscriptionData.expiration
      const clock = await provider.context.banksClient.getClock()

      // Move to 1 day after expiration
      const targetTime =
        BigInt(expiration.toNumber()) + SECONDS_PER_DAY - clock.unixTimestamp
      provider.context.setClock(
        new Clock(
          clock.slot,
          clock.epochStartTimestamp,
          clock.epoch,
          clock.leaderScheduleEpoch,
          clock.unixTimestamp + targetTime,
        ),
      )

      const minDawnOut = calculateMinDawnOut(escrowUsdcBalanceBefore, price)
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
        usdcMint: accounts.usdcMint,
        dawnMint: accounts.dawnMint,
        raydium: accounts.raydium,
        raydiumAuthority: accounts.raydiumAuthority,
        raydiumConfig: accounts.raydiumConfig,
        raydiumPool: accounts.raydiumPool,
        raydiumObservation: accounts.raydiumObservation,
        raydiumDawnVault: accounts.raydiumDawnVault,
        raydiumUsdcVault: accounts.raydiumUsdcVault,
        escrowUsdcVault: accounts.escrowUsdcVault,
        escrowDawnVault: accounts.escrowDawnVault,
        serviceProviderDawnAccount: accounts.serviceProviderDawnAccount,
        tokenProgram: accounts.tokenProgram,
        associatedTokenProgram: accounts.associatedTokenProgram,
        systemProgram: accounts.systemProgram,
      })

      provider.wallet = new Wallet(mock.serviceProvider)

      const txDetails = await confirmTx(provider, tx)

      const event = await getEvent<Claimed>(program, txDetails, 'claimed')
      expect(event.subscription.equals(mock.subscriptionPda)).toBeTruthy()
      expect(event.plan.equals(mock.planPda)).toBeTruthy()

      const swapPriceBN = new BN(event.swapPrice.toString())
      expect(swapPriceBN.gt(new BN(0))).toBeTruthy()

      // Service provider should NOT have received any DAWN yet (first claim swaps and locks)
      // claimableDawn was 0 before this claim (no initial swap on subscription)
      const serviceProviderDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.serviceProviderDawnAccount,
      )
      expect(
        serviceProviderDawnBalanceAfter.eq(serviceProviderDawnBalanceBefore),
      ).toBeTruthy()

      // ALL USDC should have been swapped
      const escrowUsdcBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )
      expect(escrowUsdcBalanceAfter.eq(new BN(0))).toBeTruthy()

      // DAWN should be in escrow vault (locked)
      const escrowDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )
      expect(escrowDawnBalanceAfter.gt(escrowDawnBalanceBefore)).toBeTruthy()
      expect(escrowDawnBalanceAfter.eq(swapPriceBN)).toBeTruthy()

      // Subscription should have claimable_dawn set
      const sub = await program.account.subscription.fetch(mock.subscriptionPda)
      expect(sub.claimableDawn.eq(swapPriceBN)).toBeTruthy()
    })

    test('cannot claim again before 24 hours', async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))

      const escrowUsdcBalance = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )

      // Even with 0 USDC, we need a valid minDawnOut for the subscription's claimable amount
      const subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )

      // Use claimable_dawn for minDawnOut calculation since USDC is 0
      const minDawnOut = subscription.claimableDawn.gt(new BN(0))
        ? subscription.claimableDawn
            .mul(new BN(10000 - 500))
            .div(new BN(10000))
        : new BN(1)

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
          usdcMint: accounts.usdcMint,
          dawnMint: accounts.dawnMint,
          raydium: accounts.raydium,
          raydiumAuthority: accounts.raydiumAuthority,
          raydiumConfig: accounts.raydiumConfig,
          raydiumPool: accounts.raydiumPool,
          raydiumObservation: accounts.raydiumObservation,
          raydiumDawnVault: accounts.raydiumDawnVault,
          raydiumUsdcVault: accounts.raydiumUsdcVault,
          escrowUsdcVault: accounts.escrowUsdcVault,
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

    test('claims locked DAWN after 24 hours', async () => {
      const subscriptionBefore = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      const claimableDawnBefore = subscriptionBefore.claimableDawn

      const escrowDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )

      const serviceProviderDawnBalanceBefore = await getBalance(
        provider.connection,
        accounts.serviceProviderDawnAccount,
      )

      // Forward time by 1 day
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

      // Use claimable_dawn for minDawnOut since we're claiming locked DAWN
      const minDawnOut = claimableDawnBefore
        .mul(new BN(10000 - 500))
        .div(new BN(10000))

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
        usdcMint: accounts.usdcMint,
        dawnMint: accounts.dawnMint,
        raydium: accounts.raydium,
        raydiumAuthority: accounts.raydiumAuthority,
        raydiumConfig: accounts.raydiumConfig,
        raydiumPool: accounts.raydiumPool,
        raydiumObservation: accounts.raydiumObservation,
        raydiumDawnVault: accounts.raydiumDawnVault,
        raydiumUsdcVault: accounts.raydiumUsdcVault,
        escrowUsdcVault: accounts.escrowUsdcVault,
        escrowDawnVault: accounts.escrowDawnVault,
        serviceProviderDawnAccount: accounts.serviceProviderDawnAccount,
        tokenProgram: accounts.tokenProgram,
        associatedTokenProgram: accounts.associatedTokenProgram,
        systemProgram: accounts.systemProgram,
      })

      const txDetails = await confirmTx(provider, tx)

      const event = await getEvent<Claimed>(program, txDetails, 'claimed')
      expect(event.subscription.equals(mock.subscriptionPda)).toBeTruthy()
      expect(event.plan.equals(mock.planPda)).toBeTruthy()
      expect(event.dawnClaimed.eq(claimableDawnBefore)).toBeTruthy()

      // Service provider should have received the locked DAWN
      const serviceProviderDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.serviceProviderDawnAccount,
      )
      expect(
        serviceProviderDawnBalanceAfter
          .sub(serviceProviderDawnBalanceBefore)
          .eq(claimableDawnBefore),
      ).toBeTruthy()

      // Escrow DAWN vault should be empty now
      const escrowDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )
      expect(escrowDawnBalanceAfter.eq(new BN(0))).toBeTruthy()

      // Subscription should have claimable_dawn = 0 now
      const sub = await program.account.subscription.fetch(mock.subscriptionPda)
      expect(sub.claimableDawn.eq(new BN(0))).toBeTruthy()
    })
  })
