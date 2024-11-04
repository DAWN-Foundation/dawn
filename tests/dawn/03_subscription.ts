import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { PublicKey, SendTransactionError, SystemProgram } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import { confirmTx, getEvent, getPlanPda, mock } from '../../app/utils'
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

interface Subscribed {
  subscription: PublicKey
  subscriber: PublicKey
  plan: PublicKey
  expiration: number
  escrow: PublicKey
}

describe('dawn::subscription', () => {
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
  let accounts: Record<string, PublicKey>
  let subscriptionPda: PublicKey
  let subscriptionBump: number

  before(async () => {
    const plans = await program.account.plan.all()
    assert.ok(plans.length > 0)
    plan = plans[0].account
    planPda = plans[0].publicKey

    const buildings = await program.account.building.all()
    assert.ok(buildings.length > 0)
    buildingPda = buildings[0].publicKey

    const newSubscription = PublicKey.findProgramAddressSync(
      [
        Buffer.from('subscription'),
        Buffer.from(planPda.toBytes()),
        Buffer.from(mock.tester.publicKey.toBytes()),
      ],
      program.programId,
    )

    subscriptionPda = newSubscription[0]
    subscriptionBump = newSubscription[1]

    // Create USDC vault token account for subscription escrow
    console.log('Creating USDC vault token account for subscription escrow...')
    const { address: escrowUsdcVault } =
      await getOrCreateAssociatedTokenAccount(
        provider.connection,
        mock.buildingOwner,
        mock.usdcMint,
        subscriptionPda,
        true,
      )

    // Create DAWN vault token account for subscription escrow
    console.log('Creating DAWN vault token account for subscription escrow...')
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
      userUsdcAccount: mock.testerUsdcAccount,
      userDawnAccount: mock.testerDawnAccount,
      buildingOwnerUsdcAccount: mock.buildingOwnerUsdcAccount,
      daoDawnAccount: mock.daoDawnAccount,
      validatorDawnAccount: mock.validatorDawnAccount,
      medallionDawnAccount: mock.medallionDawnAccount,
      escrowUsdcVault: escrowUsdcVault,
      escrowDawnVault: escrowDawnVault,
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
    assert.exists(subscriptionBump)
    assert.exists(accounts)
  })

  it('cannot subscribe to a plan that doesnt exist', async () => {
    const [planPda] = getPlanPda(
      program,
      buildingPda,
      new BN(1000),
      30,
      100,
      new BN(1000),
      new BN(1),
    )

    const subPda = PublicKey.findProgramAddressSync(
      [Buffer.from('subscription'), Buffer.from(planPda.toBytes())],
      program.programId,
    )[0]

    try {
      await program.methods
        .subscribe()
        .accounts({
          ...accounts,
          plan: planPda,
          subscription: subPda,
        })
        .signers([mock.tester])
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

  it('cannot subscribe if does not have enough USDC', async () => {
    try {
      await program.methods
        .subscribe()
        .accounts(accounts)
        .signers([mock.tester])
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

  it('subscribes to the plan', async () => {
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

    const tx = await program.methods
      .subscribe()
      .accounts(accounts)
      .signers([mock.tester])
      .rpc()

    assert.ok(tx.length > 0)
    await confirmTx(provider.connection, tx)

    // get block time, and calculate expected expiration
    let txDetails = await provider.connection.getParsedTransaction(
      tx,
      'confirmed',
    )
    let expiration = txDetails.blockTime + plan.duration * SECONDS_PER_DAY

    let subscription = await program.account.subscription.fetch(subscriptionPda)
    assert.ok(subscription.subscriber.equals(mock.tester.publicKey))
    assert.ok(subscription.plan.equals(planPda))
    assert.equal(subscription.expiration.toNumber(), expiration)
    assert.equal(subscription.bump, subscriptionBump)

    // make sure event was emitted
    const event = await getEvent<Subscribed>(program, tx, 'Subscribed')
    assert.ok(event.subscription.equals(subscriptionPda))
    assert.ok(event.subscriber.equals(mock.tester.publicKey))
    assert.ok(event.plan.equals(planPda))
    assert.ok(event.expiration > 0)

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

    // calculate total fee in DAWN (approximated with small slippage for easier testing)
    const dawnPriceInUsdc = new BN(20250) // ~2.025 USDC per DAWN
    const totalDawnFee = totalUsdcFee.mul(BPS_DENOMINATOR).div(dawnPriceInUsdc)

    // make sure the DAO DAWN account was credited
    const daoFee = totalDawnFee.mul(mock.daoFee).div(totalFeeBps)
    const daoDawnBalanceAfter = new BN(
      (
        await getAccount(provider.connection, mock.daoDawnAccount)
      ).amount.toString(),
    )
    assert.ok(daoDawnBalanceAfter.sub(daoDawnBalanceBefore).gte(daoFee))

    // make sure the validator DAWN account was credited (with 0.25% tolerance)
    const validatorFee = totalDawnFee.mul(mock.validatorFee).div(totalFeeBps)
    const validatorDawnBalanceAfter = new BN(
      (
        await getAccount(provider.connection, mock.validatorDawnAccount)
      ).amount.toString(),
    )
    assert.ok(
      validatorDawnBalanceAfter
        .sub(validatorDawnBalanceBefore)
        .gte(validatorFee),
    )

    // make sure the medallion DAWN account was credited (with 0.25% tolerance)
    const medallionFee = totalDawnFee.mul(mock.medallionFee).div(totalFeeBps)
    const medallionDawnBalanceAfter = new BN(
      (
        await getAccount(provider.connection, mock.medallionDawnAccount)
      ).amount.toString(),
    )
    assert.ok(
      medallionDawnBalanceAfter
        .sub(medallionDawnBalanceBefore)
        .gte(medallionFee),
    )

    // make sure the building owner escrow USDC vault account was debited
    const remainder = plan.price.sub(totalUsdcFee)
    const daily = remainder.div(new BN(plan.duration))
    const usdcExpected = remainder.sub(daily)
    const escrowUsdcBalanceAfter = new BN(
      (
        await getAccount(provider.connection, accounts.escrowUsdcVault)
      ).amount.toString(),
    )
    assert.ok(
      escrowUsdcBalanceAfter.sub(escrowUsdcBalanceBefore).gte(usdcExpected),
    )

    // make sure the building owner escrow DAWN vault account was credited
    const dawnExpected = daily.mul(BPS_DENOMINATOR).div(dawnPriceInUsdc)
    const escrowDawnBalanceAfter = new BN(
      (
        await getAccount(provider.connection, accounts.escrowDawnVault)
      ).amount.toString(),
    )
    assert.ok(
      escrowDawnBalanceAfter.sub(escrowDawnBalanceBefore).gte(dawnExpected),
    )
  })

  it('cannot subscribe to the same plan twice', async () => {
    try {
      await program.methods
        .subscribe()
        .accounts(accounts)
        .signers([mock.tester])
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof SendTransactionError)
      const err: SendTransactionError = error
      const msg = `Allocate: account Address { address: ${subscriptionPda.toBase58()}, base: None } already in use`
      const alreadySubscribed = err.logs.find((log) => log.includes(msg))
      assert.ok(alreadySubscribed)
    }
  })

  it('subscribes to the same plan by another user', async () => {
    // get USDC account for wallet
    const walletUsdcAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mock.usdcMint,
      wallet.publicKey,
    )

    // get Dawn account for wallet
    const walletDawnAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mock.dawnMint,
      wallet.publicKey,
    )

    // Mint 1'000 USDC to Wallet account
    await mintTo(
      provider.connection,
      wallet.payer, // Payer for tx
      mock.usdcMint, // Mint account
      walletUsdcAccount.address, // Destination
      wallet.payer, // Authority
      1_000 * 10 ** 6, // Mint 1,000 USDC (remember 6 decimals)
    )

    const [subscriptionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('subscription'),
        Buffer.from(planPda.toBytes()),
        Buffer.from(wallet.publicKey.toBytes()),
      ],
      program.programId,
    )

    const escrowUsdcVault = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      mock.buildingOwner,
      mock.usdcMint,
      subscriptionPda,
      true,
    )

    const escrowDawnVault = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      mock.buildingOwner,
      mock.dawnMint,
      subscriptionPda,
      true,
    )

    const tx = await program.methods
      .subscribe()
      .accounts({
        ...accounts,
        caller: wallet.publicKey,
        subscription: subscriptionPda,
        userDawnAccount: walletDawnAccount.address,
        userUsdcAccount: walletUsdcAccount.address,
        escrowUsdcVault: escrowUsdcVault.address,
        escrowDawnVault: escrowDawnVault.address,
      })
      .signers([wallet.payer])
      .rpc()

    assert.ok(tx.length > 0)

    // make sure event was emitted
    const event = await getEvent<Subscribed>(program, tx, 'Subscribed')
    assert.ok(event.subscription.equals(subscriptionPda))
    assert.ok(event.subscriber.equals(wallet.publicKey))
    assert.ok(event.plan.equals(planPda))
    assert.ok(event.expiration > 0)
  })
})
