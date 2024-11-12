import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError, Wallet } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { PublicKey, SendTransactionError, SystemProgram } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

import { Dawn, IDL } from '../../target/types/dawn'
import {
  getEvent,
  getPlanPda,
  getRaydiumProgram,
  mock,
  getProvider,
  PROGRAM_ID,
  confirmTx,
} from '../../app/utils'
import { BankrunProvider } from 'anchor-bankrun'
import { BanksClient, Clock } from 'solana-bankrun'
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

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)

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

    test('claims daily DAWN', async () => {
      // get balances of escrow vaults
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
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<Claimed>(program, txDetails, 'Claimed')
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
  })
