import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { Keypair, PublicKey, SendTransactionError } from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import { confirmTx, getEvent, mock } from './utils'
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { BUILDING_SIZE } from './01_building'
import { getAccount } from '@solana/spl-token'

const SECONDS_PER_DAY = 86_400
const BPS_DENOMINATOR = new BN(10_000)

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

async function getPlansForBuilding(
  program: Program<Plan>, // Anchor program
  building: PublicKey, // Public key of the building
): Promise<any[]> {
  // Define the byte offset for the `building` field in the Plan account (8 bytes for discriminator + 32 bytes for owner)
  const BUILDING_OFFSET = 8 + 32

  // Fetch all plan accounts and filter by building key
  const plans = await program.provider.connection.getProgramAccounts(
    program.programId,
    {
      // Filtering accounts by the `building` public key stored in the Plan account
      filters: [
        {
          memcmp: {
            offset: BUILDING_OFFSET, // Offset where the building public key is stored
            bytes: building.toBase58(), // The building public key to filter by
          },
        },
      ],
    },
  )

  // Decode and return the accounts
  return plans.map((accountInfo) => {
    return program.account.plan.coder.accounts.decode(
      'plan',
      accountInfo.account.data,
    )
  })
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

    try {
      await program.methods
        .subscribe()
        .accounts({
          caller: mock.tester.publicKey,
          config: configPda,
          plan: planPda,
          andrenaUsdcAccount: mock.andrenaUsdcAccount,
          dawnUsdcAccount: mock.dawnUsdcAccount,
          userUsdcAccount: mock.testerUsdcAccount,
          boUsdcAccount: mock.boUsdcAccount,
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

  it('subscribes to the plan', async () => {
    const testerUsdcBalanceBefore = new BN(
      (
        await getAccount(provider.connection, mock.testerUsdcAccount)
      ).amount.toString(),
    )
    const andrenaUsdcBalanceBefore = new BN(
      (
        await getAccount(provider.connection, mock.andrenaUsdcAccount)
      ).amount.toString(),
    )
    const dawnUsdcBalanceBefore = new BN(
      (
        await getAccount(provider.connection, mock.dawnUsdcAccount)
      ).amount.toString(),
    )
    const boUsdcBalanceBefore = new BN(
      (
        await getAccount(provider.connection, mock.boUsdcAccount)
      ).amount.toString(),
    )

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
        andrenaUsdcAccount: mock.andrenaUsdcAccount,
        dawnUsdcAccount: mock.dawnUsdcAccount,
        userUsdcAccount: mock.testerUsdcAccount,
        boUsdcAccount: mock.boUsdcAccount,
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
    const event = await getEvent(program, tx, 'subscribed')
    assert.ok(event.subscription.equals(subscriptionPda))
    assert.ok(event.subscriber.equals(mock.tester.publicKey))
    assert.ok(event.plan.equals(planPda))
    assert.ok(event.expiration > 0)

    // make sure the user USDC account was debited
    const userUsdcBalanceAfter = new BN(
      (
        await getAccount(provider.connection, mock.testerUsdcAccount)
      ).amount.toString(),
    )
    assert.ok(userUsdcBalanceAfter.eq(testerUsdcBalanceBefore.sub(plan.price)))

    // make sure the Andrena USDC account was credited
    const andrenaUsdcBalanceAfter = new BN(
      (
        await getAccount(provider.connection, mock.andrenaUsdcAccount)
      ).amount.toString(),
    )
    const andrenaFee = mock.andrenaFee.mul(plan.price).div(BPS_DENOMINATOR)
    assert.ok(
      andrenaUsdcBalanceAfter.eq(andrenaUsdcBalanceBefore.add(andrenaFee)),
    )

    // make sure the Dawn USDC account was credited
    const dawnUsdcBalanceAfter = new BN(
      (
        await getAccount(provider.connection, mock.dawnUsdcAccount)
      ).amount.toString(),
    )
    const dawnFee = mock.dawnFee.mul(plan.price).div(BPS_DENOMINATOR)
    assert.ok(dawnUsdcBalanceAfter.eq(dawnUsdcBalanceBefore.add(dawnFee)))
  })
})
