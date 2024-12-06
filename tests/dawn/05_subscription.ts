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

import { Dawn, IDL } from '../../target/types/dawn'
import {
  getEvent,
  getPlanPda,
  mock,
  getProvider,
  PROGRAM_ID,
  loadWallet,
  confirmTx,
} from '../../app/utils'
import { beforeAll } from '@jest/globals'
import { Clock } from 'solana-bankrun'
import { getBalance } from '../../app/dawn/utils'

const SECONDS_PER_DAY = 86_400
const BPS_DENOMINATOR = new BN(10_000)
const TOLERANCE_BPS = new BN(9975)

const Q32 = new BN(2).pow(new BN(32))

interface Subscribed {
  subscription: PublicKey
  subscriber: PublicKey
  plan: PublicKey
  expiration: number
  swapPrice: BN
}

export const subscriptionTests = () =>
  describe('dawn::subscription', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>

    let plan: Awaited<ReturnType<typeof program.account.plan.fetch>>
    let accounts: Record<string, PublicKey>

    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.customer)
      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)

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

      // accounts for a successful subscription
      accounts = {
        caller: mock.customer.publicKey,
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
        userUsdcAccount: mock.customerUsdcAccount,
        userDawnAccount: mock.customerDawnAccount,
        daoDawnAccount: mock.daoDawnAccount,
        validatorDawnAccount: mock.validatorDawnAccount,
        medallionDawnAccount: mock.medallionDawnAccount,
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
        mock.devicePda,
        new BN(1000),
        30,
        100,
        new BN(1000),
        new BN(1),
      )

      const badSubscriptionPda = PublicKey.findProgramAddressSync(
        [
          Buffer.from('subscription'),
          Buffer.from(mock.planPda.toBytes()),
          Buffer.from(mock.customer.publicKey.toBytes()),
        ],
        program.programId,
      )[0]

      try {
        await program.methods
          .subscribe()
          .accounts({
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
        await program.methods
          .subscribe()
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
      }
    })

    test('subscribes to the plan', async () => {
      // Mint 1'000 USDC to Customer account
      await mintTo(
        provider.context.banksClient, // Banks client
        wallet.payer, // Payer for transaction
        mock.usdcMint, // Mint
        mock.customerUsdcAccount, // Token account
        wallet.publicKey, // Mint authority
        BigInt(1_000_000_000_000), // 6 decimals
      )

      const testerUsdcBalanceBefore = await getBalance(
        provider.connection,
        mock.customerUsdcAccount,
      )

      const daoDawnBalanceBefore = await getBalance(
        provider.connection,
        mock.daoDawnAccount,
      )

      const validatorDawnBalanceBefore = await getBalance(
        provider.connection,
        mock.validatorDawnAccount,
      )

      const medallionDawnBalanceBefore = await getBalance(
        provider.connection,
        mock.medallionDawnAccount,
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

      const tx = await program.methods
        .subscribe()
        .accounts(accounts)
        .signers([mock.customer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<Subscribed>(program, txDetails, 'Subscribed')
      assert.ok(event.subscription.equals(mock.subscriptionPda))
      assert.ok(event.subscriber.equals(mock.customer.publicKey))
      assert.ok(event.plan.equals(mock.planPda))
      assert.ok(event.expiration > 0)
      assert.ok(event.swapPrice.eq(price))

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
      const totalFeeBps = mock.daoFee
        .add(mock.validatorFee)
        .add(mock.medallionFee)
      const totalUsdcFee = plan.price.mul(totalFeeBps).div(BPS_DENOMINATOR)

      // make sure the device owner escrow USDC vault account was debited
      const usdcRemainder = plan.price.sub(totalUsdcFee)
      const dailyUsdc = usdcRemainder.div(new BN(plan.duration))
      const dailyDawn = dailyUsdc.mul(price).div(Q32)
      const usdcExpected = usdcRemainder.sub(dailyUsdc)
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
      assert.ok(
        escrowDawnBalanceAfter.sub(escrowDawnBalanceBefore).eq(dailyDawn),
      )

      const totalDawn = totalUsdcFee.add(dailyUsdc).mul(price).div(Q32)
      const totalDawnWithSlippage = totalDawn
        .mul(BPS_DENOMINATOR.sub(new BN(100)))
        .div(BPS_DENOMINATOR)
      const totalDawnFee = totalDawnWithSlippage.sub(dailyDawn)

      // make sure the DAO DAWN account was credited with the DAO fee portion
      const daoFee = totalDawnFee.mul(mock.daoFee).div(totalFeeBps)
      const daoDawnBalanceAfter = await getBalance(
        provider.connection,
        mock.daoDawnAccount,
      )
      assert.ok(daoDawnBalanceAfter.sub(daoDawnBalanceBefore).eq(daoFee))

      // make sure the validator DAWN account was credited with the validator fee portion
      const validatorFee = totalDawnFee.mul(mock.validatorFee).div(totalFeeBps)
      const validatorDawnBalanceAfter = await getBalance(
        provider.connection,
        mock.validatorDawnAccount,
      )
      assert.ok(
        validatorDawnBalanceAfter
          .sub(validatorDawnBalanceBefore)
          .eq(validatorFee),
      )

      // make sure the medallion DAWN account was credited with the medallion fee portion
      const medallionFee = totalDawnFee.mul(mock.medallionFee).div(totalFeeBps)
      const medallionDawnBalanceAfter = await getBalance(
        provider.connection,
        mock.medallionDawnAccount,
      )
      assert.ok(
        medallionDawnBalanceAfter
          .sub(medallionDawnBalanceBefore)
          .eq(medallionFee),
      )

      // TODO >> fix this
      // get block time, and calculate expected expiration
      // let expiration = txDetails.blockTime + plan.duration * SECONDS_PER_DAY

      // make sure the subscription was created
      let subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )
      assert.ok(subscription.subscriber.equals(mock.customer.publicKey))
      assert.ok(subscription.plan.equals(mock.planPda))
      // assert.equal(subscription.expiration.toNumber(), expiration)
      // assert.ok(subscription.lastClaim.eq(new BN(txDetails.blockTime)))
      assert.ok(subscription.claimableDawn.eq(dailyDawn))
      assert.ok(subscription.dailyUsdc.eq(dailyUsdc))
      assert.equal(subscription.bump, mock.subscriptionBump)
    })

    test('cannot subscribe to the same plan twice', async () => {
      try {
        await program.methods
          .subscribe()
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
      const [subscriptionPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('subscription'),
          Buffer.from(mock.planPda.toBytes()),
          Buffer.from(wallet.publicKey.toBytes()),
        ],
        program.programId,
      )

      provider.wallet = new Wallet(wallet.payer)
      const program2 = new Program<Dawn>(IDL, PROGRAM_ID, provider)

      const tx = await program2.methods
        .subscribe()
        .accounts({
          ...accounts,
          caller: wallet.publicKey,
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
      const event = await getEvent<Subscribed>(program, txDetails, 'Subscribed')
      assert.ok(event.subscription.equals(subscriptionPda))
      assert.ok(event.subscriber.equals(wallet.publicKey))
      assert.ok(event.plan.equals(mock.planPda))
      assert.ok(event.expiration > 0)
    })
  })
