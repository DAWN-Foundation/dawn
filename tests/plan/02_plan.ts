import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { Keypair, PublicKey, SendTransactionError } from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import { getEvent, mock } from './utils'

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

describe('plan::plan', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.Plan as Program<Plan>
  const wallet = provider.wallet as NodeWallet

  const buildingName = 'Building 1'
  const buildingAddress = '123 Main St'
  const buildingFloors = 5
  const [buildingPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('building'),
      Buffer.from(buildingName),
      Buffer.from(buildingAddress),
      Buffer.from([buildingFloors]),
    ],
    program.programId,
  )

  let building: {
    owner: anchor.web3.PublicKey
    name: string
    address: string
    floors: number
    bump: number
  }

  before(async () => {
    building = await program.account.building.fetch(buildingPda)
  })

  it('mock setup', () => {
    assert.exists(mock)
    assert.ok(building.owner.equals(mock.buildingOwner.publicKey))
  })

  it('cannot add plan with zero price', async () => {
    const price = new BN(0)
    const duration = 30
    const speed = 1_000
    const capacity = new BN(1000)
    const slaId = new BN(1)

    const [planPda] = getPlanPda(
      program,
      buildingPda,
      price,
      duration,
      speed,
      capacity,
      slaId,
    )

    try {
      await program.methods
        .addPlan(price, duration, speed, capacity, slaId)
        .accounts({
          caller: mock.buildingOwner.publicKey,
          building: buildingPda,
          plan: planPda,
        })
        .signers([mock.buildingOwner])
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof AnchorError)
      const err: AnchorError = error
      assert.strictEqual(err.error.errorMessage, 'Plan price is zero')
      assert.strictEqual(err.error.errorCode.number, 6006)
    }
  })

  it('cannot add plan with zero duration', async () => {
    const price = new BN(5)
    const duration = 0
    const speed = 1_000
    const capacity = new BN(1000)
    const slaId = new BN(1)

    const [planPda] = getPlanPda(
      program,
      buildingPda,
      price,
      duration,
      speed,
      capacity,
      slaId,
    )

    try {
      await program.methods
        .addPlan(price, duration, speed, capacity, slaId)
        .accounts({
          caller: mock.buildingOwner.publicKey,
          building: buildingPda,
          plan: planPda,
        })
        .signers([mock.buildingOwner])
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof AnchorError)
      const err: AnchorError = error
      assert.strictEqual(err.error.errorMessage, 'Plan duration is zero')
      assert.strictEqual(err.error.errorCode.number, 6007)
    }
  })

  it('cannot add plan with zero speed', async () => {
    const price = new BN(5)
    const duration = 30
    const speed = 0
    const capacity = new BN(1000)
    const slaId = new BN(1)

    const [planPda] = getPlanPda(
      program,
      buildingPda,
      price,
      duration,
      speed,
      capacity,
      slaId,
    )

    try {
      await program.methods
        .addPlan(price, duration, speed, capacity, slaId)
        .accounts({
          caller: mock.buildingOwner.publicKey,
          building: buildingPda,
          plan: planPda,
        })
        .signers([mock.buildingOwner])
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof AnchorError)
      const err: AnchorError = error
      assert.strictEqual(err.error.errorMessage, 'Plan speed is zero')
      assert.strictEqual(err.error.errorCode.number, 6008)
    }
  })

  it('cannot be added for a building not owned by the caller', async () => {
    const price = new BN(5)
    const duration = 30
    const speed = 1_000
    const capacity = new BN(1000)
    const slaId = new BN(1)

    const [planPda] = getPlanPda(
      program,
      buildingPda,
      price,
      duration,
      speed,
      capacity,
      slaId,
    )

    try {
      await program.methods
        .addPlan(price, duration, speed, capacity, slaId)
        .accounts({
          caller: wallet.publicKey,
          building: buildingPda,
          plan: planPda,
        })
        .signers([wallet.payer])
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof AnchorError)
      const err: AnchorError = error
      assert.strictEqual(
        err.error.errorMessage,
        'A raw constraint was violated',
      )
      assert.strictEqual(err.error.errorCode.number, 2003)
    }
  })

  it('adds the plan', async () => {
    const price = new BN(5)
    const duration = 30
    const speed = 1_000
    const capacity = new BN(1000)
    const slaId = new BN(1)

    const [planPda, planBump] = getPlanPda(
      program,
      buildingPda,
      price,
      duration,
      speed,
      capacity,
      slaId,
    )

    const tx = await program.methods
      .addPlan(price, duration, speed, capacity, slaId)
      .accounts({
        caller: mock.buildingOwner.publicKey,
        building: buildingPda,
        plan: planPda,
      })
      .signers([mock.buildingOwner])
      .rpc()
    assert.ok(tx.length > 0)

    const plan = await program.account.plan.fetch(planPda)

    assert.ok(plan.owner.equals(mock.buildingOwner.publicKey))
    assert.ok(plan.building.equals(buildingPda))
    assert.ok(plan.price.eq(price))
    assert.equal(plan.duration, duration)
    assert.equal(plan.speed, speed)
    assert.ok(plan.capacity.eq(capacity))
    assert.ok(plan.slaId.eq(slaId))
    assert.equal(plan.bump, planBump)

    // make sure event was emitted
    const event = await getEvent(program, tx, 'planAdded')
    assert.ok(event.owner.equals(mock.buildingOwner.publicKey))
    assert.ok(event.building.equals(buildingPda))
    assert.ok(event.price.eq(price))
    assert.equal(event.duration, duration)
    assert.equal(event.speed, speed)
    assert.ok(event.capacity.eq(capacity))
    assert.ok(event.slaId.eq(slaId))
  })

  it('cannot add a plan with the same parameters', async () => {
    const price = new BN(5)
    const duration = 30
    const speed = 1_000
    const capacity = new BN(1000)
    const slaId = new BN(1)

    const [planPda] = getPlanPda(
      program,
      buildingPda,
      price,
      duration,
      speed,
      capacity,
      slaId,
    )

    try {
      await program.methods
        .addPlan(price, duration, speed, capacity, slaId)
        .accounts({
          caller: mock.buildingOwner.publicKey,
          building: buildingPda,
          plan: planPda,
        })
        .signers([mock.buildingOwner])
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

  it('adds second plan with different parameters to the same building', async () => {
    const price = new BN(10)
    const duration = 60
    const speed = 2_000
    const capacity = new BN(2000)
    const slaId = new BN(2)

    const [planPda, planBump] = getPlanPda(
      program,
      buildingPda,
      price,
      duration,
      speed,
      capacity,
      slaId,
    )

    const tx = await program.methods
      .addPlan(price, duration, speed, capacity, slaId)
      .accounts({
        caller: mock.buildingOwner.publicKey,
        building: buildingPda,
        plan: planPda,
      })
      .signers([mock.buildingOwner])
      .rpc()
    assert.ok(tx.length > 0)

    const plan = await program.account.plan.fetch(planPda)

    assert.ok(plan.owner.equals(mock.buildingOwner.publicKey))
    assert.ok(plan.building.equals(buildingPda))
    assert.ok(plan.price.eq(price))
    assert.equal(plan.duration, duration)
    assert.equal(plan.speed, speed)
    assert.ok(plan.capacity.eq(capacity))
    assert.ok(plan.slaId.eq(slaId))
    assert.equal(plan.bump, planBump)

    // make sure event was emitted
    const event = await getEvent(program, tx, 'planAdded')
    assert.ok(event.owner.equals(mock.buildingOwner.publicKey))
    assert.ok(event.building.equals(buildingPda))
    assert.ok(event.price.eq(price))
    assert.equal(event.duration, duration)
    assert.equal(event.speed, speed)
    assert.ok(event.capacity.eq(capacity))
    assert.ok(event.slaId.eq(slaId))
  })

  // REMOVE

  it('cannot remove a plan that does not exist', async () => {
    const badPlan = Keypair.generate()

    try {
      await program.methods
        .removePlan()
        .accounts({
          caller: mock.buildingOwner.publicKey,
          building: buildingPda,
          plan: badPlan.publicKey,
        })
        .signers([mock.buildingOwner])
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof AnchorError)
      const err: AnchorError = error
      assert.strictEqual(
        err.error.errorMessage,
        'The program expected this account to be already initialized',
      )
      assert.strictEqual(err.error.errorCode.number, 3012)
    }
  })

  it('cannot remove a plan that is not owned by the caller', async () => {
    const price = new BN(5)
    const duration = 30
    const speed = 1_000
    const capacity = new BN(1000)
    const slaId = new BN(1)

    const [planPda] = getPlanPda(
      program,
      buildingPda,
      price,
      duration,
      speed,
      capacity,
      slaId,
    )

    try {
      await program.methods
        .removePlan()
        .accounts({
          caller: wallet.publicKey,
          building: buildingPda,
          plan: planPda,
        })
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof AnchorError)
      const err: AnchorError = error
      assert.strictEqual(
        err.error.errorMessage,
        'A raw constraint was violated',
      )
      assert.strictEqual(err.error.errorCode.number, 2003)
    }
  })

  it('removes the plan', async () => {
    const price = new BN(5)
    const duration = 30
    const speed = 1_000
    const capacity = new BN(1000)
    const slaId = new BN(1)

    const [planPda] = getPlanPda(
      program,
      buildingPda,
      price,
      duration,
      speed,
      capacity,
      slaId,
    )

    const tx = await program.methods
      .removePlan()
      .accounts({
        caller: mock.buildingOwner.publicKey,
        building: buildingPda,
        plan: planPda,
      })
      .signers([mock.buildingOwner])
      .rpc()
    assert.ok(tx.length > 0)

    // try {
    //   await program.account.plan.fetch(planPda)
    //   assert.ok(false)
    // } catch (error) {
    //   assert.ok(error instanceof AnchorError)
    //   const err: AnchorError = error
    //   assert.strictEqual(
    //     err.error.errorMessage,
    //     'The program expected this account to be already initialized',
    //   )
    //   assert.strictEqual(err.error.errorCode.number, 3012)
    // }

    // make sure event was emitted
    const event = await getEvent(program, tx, 'planRemoved')
    assert.ok(event.plan.equals(planPda))
    assert.ok(event.building.equals(buildingPda))
  })
})
