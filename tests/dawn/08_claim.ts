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
  PROGRAM_ID,
  confirmTx,
  getPlanPda,
  getSubscriptionPda,
} from '../../app/utils'
import { BankrunProvider } from 'anchor-bankrun'
import { Clock } from 'solana-bankrun'
import { beforeAll, expect } from '@jest/globals'
import { getBalance } from '../../app/dawn/utils'

const SECONDS_PER_DAY = 86_400n
const BPS_DENOMINATOR = new BN(10_000)
const SLIPPAGE_BPS = new BN(9900)

const Q32 = new BN(2).pow(new BN(32))

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

      program = anchor.workspace.DAWN as Program<Dawn>;

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
        escrowUsdcVault: mock.escrowUsdcVault,
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
      try {
        await program.methods
          .claim()
          .accounts(accounts)
          .signers([mock.serviceProvider])
          .rpc()

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
        mock.accessDomainPda,
        mock.devicePda,
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

      try {
        await program.methods
          .claim()
          .accountsPartial({
            ...accounts,
            plan: badPlanPda,
            subscription: badSubscriptionPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
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

      try {
        await program.methods
          .claim()
          .accounts({ ...accounts, caller: mock.customer.publicKey })
          .signers([mock.customer])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('A raw constraint was violated')
      }
    })

    test('claims daily DAWN', async () => {
      // get balances of escrow USDC vault
      const escrowUsdcBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
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
      const raydiumUsdcVault = await getAccount(
        provider.connection,
        accounts.raydiumUsdcVault,
      )

      const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
      const usdcVaultAmount = new BN(raydiumUsdcVault.amount.toString())
      const price = dawnVaultAmount.mul(Q32).div(usdcVaultAmount)

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

      const tx = await program.methods
        .claim()
        .accounts(accounts)
        .signers([mock.serviceProvider])
        .transaction();

      provider.wallet = new Wallet(mock.serviceProvider);

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<Claimed>(program, txDetails, 'claimed')
      expect(event.subscription.equals(mock.subscriptionPda)).toBeTruthy()
      expect(event.plan.equals(mock.planPda)).toBeTruthy()
      expect(event.swapPrice.gte(price)).toBeTruthy()
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

      // make sure the escrow USDC vault was debited by the daily USDC amount
      // with 1% tolerance (to account for slippage)
      const escrowUsdcBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )
      expect(
        escrowUsdcBalanceBefore
          .sub(escrowUsdcBalanceAfter)
          .gte(subscription.dailyUsdc.mul(SLIPPAGE_BPS).div(BPS_DENOMINATOR)),
      ).toBeTruthy()

      // calculate next daily DAWN portion (with 1% slippage)
      const nextDailyDawn = subscription.dailyUsdc
        .mul(event.swapPrice)
        .div(Q32)
        .mul(SLIPPAGE_BPS)
        .div(BPS_DENOMINATOR)

      // make sure the escrow DAWN vault was credited by the next daily DAWN amount
      const escrowDawnBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowDawnVault,
      )
      expect(escrowDawnBalanceAfter.gte(nextDailyDawn)).toBeTruthy()

      // make sure the subscription was updated
      const sub = await program.account.subscription.fetch(mock.subscriptionPda)
      // assert.ok(subscription.lastClaim.eq(new BN(txDetails.blockTime)))
      expect(sub.claimableDawn.gte(nextDailyDawn)).toBeTruthy()
    })

    test('cannot claim again right away before the next day', async () => {
      // small wait to make sure the last claim is updated
      await new Promise((resolve) => setTimeout(resolve, 300))

      try {
        await program.methods
          .claim()
          .accounts(accounts)
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Claim too early')
      }
    })

    test('claiming after 3 days should claim previous 1 day, then swap and lock 3 days worth of DAWN', async () => {
      subscription = await program.account.subscription.fetch(
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

      // get balances of escrow USDC vault
      const escrowUsdcBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
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
      const raydiumUsdcVault = await getAccount(
        provider.connection,
        accounts.raydiumUsdcVault,
      )

      const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
      const usdcVaultAmount = new BN(raydiumUsdcVault.amount.toString())
      const price = dawnVaultAmount.mul(Q32).div(usdcVaultAmount)

      const tx = await program.methods
        .claim()
        .accounts(accounts)
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<Claimed>(program, txDetails, 'claimed')
      expect(event.subscription.equals(mock.subscriptionPda)).toBeTruthy()
      expect(event.plan.equals(mock.planPda)).toBeTruthy()
      expect(event.swapPrice.gte(price)).toBeTruthy()
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

      // make sure the escrow USDC vault was debited by the daily USDC amount
      // with 1% tolerance (to account for slippage)
      const escrowUsdcBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )
      expect(
        escrowUsdcBalanceBefore
          .sub(escrowUsdcBalanceAfter)
          .gte(subscription.dailyUsdc.mul(SLIPPAGE_BPS).div(BPS_DENOMINATOR)),
      ).toBeTruthy()

      // calculate next daily DAWN portion (with 1% slippage)
      const nextDailyDawn = subscription.dailyUsdc
        .mul(new BN(3))
        .mul(price)
        .div(Q32)
        .mul(SLIPPAGE_BPS)
        .div(BPS_DENOMINATOR)

      // make sure the subscription was updated to have 3 days worth of claimable DAWN
      const sub = await program.account.subscription.fetch(mock.subscriptionPda)
      expect(sub.claimableDawn.gte(nextDailyDawn)).toBeTruthy()
    })

    test('claims accumulated 3 days worth of DAWN', async () => {
      subscription = await program.account.subscription.fetch(
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

      // get balances of escrow USDC vault
      const escrowUsdcBalanceBefore = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )

      // get raydium vaults
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
        .claim()
        .accounts(accounts)
        .signers([mock.serviceProvider])
        .rpc()

      // make sure the escrow USDC vault was debited by the daily USDC amount
      // with 1% tolerance (to account for slippage)
      const escrowUsdcBalanceAfter = await getBalance(
        provider.connection,
        accounts.escrowUsdcVault,
      )
      expect(
        escrowUsdcBalanceBefore
          .sub(escrowUsdcBalanceAfter)
          .gte(subscription.dailyUsdc.mul(SLIPPAGE_BPS).div(BPS_DENOMINATOR)),
      ).toBeTruthy()

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
      const nextDailyDawn = subscription.dailyUsdc
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
