import fs from 'fs'
import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import {
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
} from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import { confirmTx, getEvent, mock } from './utils'
import { BUILDING_SIZE } from './01_building'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAccount,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { getRaydiumProgram } from '../../app/utils'

const SECONDS_PER_DAY = 86_400
const BPS_DENOMINATOR = new BN(10_000)

interface Subscribed {
  subscription: PublicKey
  subscriber: PublicKey
  plan: PublicKey
  expiration: number
}

// Helper function to get the PDA for a plan given plan parameters
function getPlanPda(
  program: Program<Plan>,
  building: PublicKey,
  price: BN,
  duration: number,
  speed: number,
  capacity: BN,
  slaId: BN,
): [PublicKey, number] {
  const durationBuffer = Buffer.alloc(2) // 2 bytes for a 16-bit integer
  durationBuffer.writeUInt16LE(duration)

  const speedBuffer = Buffer.alloc(4) // 4 bytes for a 32-bit integer
  speedBuffer.writeUInt32LE(speed)

  const [planPda, planBump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('plan'),
      Buffer.from(building.toBytes()),
      Buffer.from(price.toArray('le', 8)),
      durationBuffer,
      speedBuffer,
      Buffer.from(capacity.toArray('le', 8)),
      Buffer.from(slaId.toArray('le', 8)),
    ],
    program.programId,
  )

  return [planPda, planBump]
}

describe('plan::subscription', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.Plan as Program<Plan>
  const wallet = provider.wallet as NodeWallet

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )

  let buildingPda: PublicKey
  let planPda: PublicKey
  let plan: Awaited<ReturnType<typeof program.account.plan.fetch>>

  before(async () => {
    const plans = await program.account.plan.all()
    assert.ok(plans.length > 0)
    plan = plans[0].account
    planPda = plans[0].publicKey

    const buildings = await program.account.building.all()
    assert.ok(buildings.length > 0)
    buildingPda = buildings[0].publicKey
  })

  it('mock setup', () => {
    assert.exists(mock)
    assert.exists(plan)
    assert.ok(plan.owner.equals(mock.buildingOwner.publicKey))
    assert.exists(planPda)
    assert.exists(buildingPda)
  })

  // it('cannot subscribe to a plan that doesnt exist', async () => {
  //   const [planPda] = getPlanPda(
  //     program,
  //     buildingPda,
  //     new BN(1000),
  //     30,
  //     100,
  //     new BN(1000),
  //     new BN(1),
  //   )

  //   try {
  //     await program.methods
  //       .subscribe()
  //       .accounts({
  //         caller: mock.tester.publicKey,
  //         config: configPda,
  //         plan: planPda,
  //         userUsdcAccount: mock.testerUsdcAccount,
  //       })
  //       .signers([mock.tester])
  //       .rpc()
  //     assert.ok(false)
  //   } catch (error) {
  //     assert.ok(error instanceof AnchorError)
  //     const err: AnchorError = error
  //     assert.strictEqual(
  //       err.error.errorMessage,
  //       'The program expected this account to be already initialized',
  //     )
  //   }
  // })

  // it('cannot subscribe if does not have enough USDC', async () => {
  //   try {
  //     await program.methods
  //       .subscribe()
  //       .accounts({
  //         caller: mock.tester.publicKey,
  //         config: configPda,
  //         plan: planPda,
  //         andrenaUsdcAccount: mock.andrenaUsdcAccount,
  //         dawnUsdcAccount: mock.dawnUsdcAccount,
  //         boUsdcAccount: mock.boUsdcAccount,
  //         userUsdcAccount: mock.testerUsdcAccount,
  //       })
  //       .signers([mock.tester])
  //       .rpc()
  //     assert.ok(false)
  //   } catch (error) {
  //     assert.ok(error instanceof AnchorError)
  //     const err: AnchorError = error
  //     assert.strictEqual(err.error.errorMessage, 'Insufficient funds')
  //   }
  // })

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

    // const testerUsdcBalanceBefore = new BN(
    //   (
    //     await getAccount(provider.connection, mock.testerUsdcAccount)
    //   ).amount.toString(),
    // )
    // const andrenaUsdcBalanceBefore = new BN(
    //   (
    //     await getAccount(provider.connection, mock.andrenaUsdcAccount)
    //   ).amount.toString(),
    // )
    // const dawnUsdcBalanceBefore = new BN(
    //   (
    //     await getAccount(provider.connection, mock.dawnUsdcAccount)
    //   ).amount.toString(),
    // )
    // const boUsdcBalanceBefore = new BN(
    //   (
    //     await getAccount(provider.connection, mock.boUsdcAccount)
    //   ).amount.toString(),
    // )

    const [subscriptionPda, subscriptionBump] =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from('subscription'),
          Buffer.from(planPda.toBytes()),
          Buffer.from(mock.tester.publicKey.toBytes()),
        ],
        program.programId,
      )

    const tx = await program.methods
      .subscribe()
      .accounts({
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
        dawnVault: mock.dawnVault,
        usdcVault: mock.usdcVault,
        // token accounts
        userUsdcAccount: mock.testerUsdcAccount,
        userDawnAccount: mock.testerDawnAccount,
        buildingOwnerUsdcAccount: mock.boUsdcAccount,
        daoDawnAccount: mock.daoDawnAccount,
        validatorDawnAccount: mock.validatorDawnAccount,
        medallionDawnAccount: mock.medallionDawnAccount,
        // programs
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
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

    // make sure the user USDC account was debited
    // const userUsdcBalanceAfter = new BN(
    //   (
    //     await getAccount(provider.connection, mock.testerUsdcAccount)
    //   ).amount.toString(),
    // )
    // assert.ok(userUsdcBalanceAfter.eq(testerUsdcBalanceBefore.sub(plan.price)))

    // // make sure the Andrena USDC account was credited
    // const andrenaUsdcBalanceAfter = new BN(
    //   (
    //     await getAccount(provider.connection, mock.andrenaUsdcAccount)
    //   ).amount.toString(),
    // )
    // const andrenaFee = mock.andrenaFee.mul(plan.price).div(BPS_DENOMINATOR)
    // assert.ok(
    //   andrenaUsdcBalanceAfter.eq(andrenaUsdcBalanceBefore.add(andrenaFee)),
    // )

    // // make sure the Dawn USDC account was credited
    // const dawnUsdcBalanceAfter = new BN(
    //   (
    //     await getAccount(provider.connection, mock.dawnUsdcAccount)
    //   ).amount.toString(),
    // )
    // const dawnFee = mock.dawnFee.mul(plan.price).div(BPS_DENOMINATOR)
    // assert.ok(dawnUsdcBalanceAfter.eq(dawnUsdcBalanceBefore.add(dawnFee)))

    // // make sure the BO USDC account was credited
    // const boUsdcBalanceAfter = new BN(
    //   (
    //     await getAccount(provider.connection, mock.boUsdcAccount)
    //   ).amount.toString(),
    // )
    // const remainder = plan.price.sub(andrenaFee).sub(dawnFee)
    // assert.ok(boUsdcBalanceAfter.eq(boUsdcBalanceBefore.add(remainder)))
  })

  it('cannot subscribe to the same plan twice', async () => {
    const [subscriptionPda, subscriptionBump] =
      PublicKey.findProgramAddressSync(
        [
          Buffer.from('subscription'),
          Buffer.from(planPda.toBytes()),
          Buffer.from(mock.tester.publicKey.toBytes()),
        ],
        program.programId,
      )

    try {
      await program.methods
        .subscribe()
        .accounts({
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
          dawnVault: mock.dawnVault,
          usdcVault: mock.usdcVault,
          // token accounts
          userUsdcAccount: mock.testerUsdcAccount,
          userDawnAccount: mock.testerDawnAccount,
          daoDawnAccount: mock.daoDawnAccount,
          validatorDawnAccount: mock.validatorDawnAccount,
          medallionDawnAccount: mock.medallionDawnAccount,
          // programs
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([mock.tester])
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof SendTransactionError)
      const err: SendTransactionError = error
      assert.strictEqual(
        err.transactionError.message,
        'Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0',
      )
    }
  })

  it('can be subscribed to by another user', async () => {
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

    const tx = await program.methods
      .subscribe()
      .accounts({
        caller: wallet.publicKey,
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
        dawnVault: mock.dawnVault,
        usdcVault: mock.usdcVault,
        // token accounts
        userUsdcAccount: walletUsdcAccount.address,
        userDawnAccount: walletDawnAccount.address,
        daoDawnAccount: mock.daoDawnAccount,
        validatorDawnAccount: mock.validatorDawnAccount,
        medallionDawnAccount: mock.medallionDawnAccount,
        // programs
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
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
