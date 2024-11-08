import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { Keypair, PublicKey, SendTransactionError } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'

import { Dawn, IDL } from '../../target/types/dawn'
import {
  getEvent,
  mock,
  getPlanPda,
  getPlansForBuilding,
  getProvider,
  PROGRAM_ID,
} from '../../app/utils'
import { beforeAll } from '@jest/globals'
import { BanksClient } from 'solana-bankrun'

interface PlanAdded {
  owner: PublicKey
  building: PublicKey
  price: BN
  duration: number
  speed: number
  capacity: BN
  slaId: BN
}

interface PlanRemoved {
  plan: PublicKey
  building: PublicKey
}

const USDC_DECIMALS = new BN(10).pow(new BN(6))

export const planTests = () =>
  describe('dawn::plan', () => {
    let program: Program<Dawn>
    let wallet: NodeWallet
    let buildingPda: PublicKey
    let building: Awaited<ReturnType<typeof program.account.building.fetch>>
    let client: BanksClient

    beforeAll(async () => {
      const { provider, client: banksClient } = await getProvider()
      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)
      wallet = provider.wallet
      client = banksClient

      const buildings = await program.account.building.all()
      assert.ok(buildings.length > 0)
      building = buildings[0].account
      buildingPda = buildings[0].publicKey
    })

    test('mock setup', () => {
      assert.exists(mock)
      assert.exists(building)
      assert.ok(building.owner.equals(mock.provider.publicKey))
      assert.exists(buildingPda)
    })

    test('cannot add plan with zero price', async () => {
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
            caller: mock.provider.publicKey,
            building: buildingPda,
            plan: planPda,
          })
          .signers([mock.provider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Plan price is zero')
      }
    })

    test('cannot add plan with zero duration', async () => {
      const price = new BN(100).mul(USDC_DECIMALS)
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
            caller: mock.provider.publicKey,
            building: buildingPda,
            plan: planPda,
          })
          .signers([mock.provider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Plan duration is zero')
      }
    })

    test('cannot add plan with zero speed', async () => {
      const price = new BN(100).mul(USDC_DECIMALS)
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
            caller: mock.provider.publicKey,
            building: buildingPda,
            plan: planPda,
          })
          .signers([mock.provider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Plan speed is zero')
      }
    })

    test('cannot be added for a building not owned by the caller', async () => {
      const price = new BN(100).mul(USDC_DECIMALS)
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

    test('adds the plan', async () => {
      const price = new BN(100).mul(USDC_DECIMALS)
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
          caller: mock.provider.publicKey,
          building: buildingPda,
          plan: planPda,
        })
        .signers([mock.provider])
        .transaction()

      const txDetails = await client.processTransaction(tx)

      const plan = await program.account.plan.fetch(planPda)

      assert.ok(plan.owner.equals(mock.provider.publicKey))
      assert.ok(plan.building.equals(buildingPda))
      assert.ok(plan.price.eq(price))
      assert.equal(plan.duration, duration)
      assert.equal(plan.speed, speed)
      assert.ok(plan.capacity.eq(capacity))
      assert.ok(plan.slaId.eq(slaId))
      assert.equal(plan.bump, planBump)

      // make sure can fetch the plan by building
      const [buildingPlan] = await getPlansForBuilding(program, buildingPda)
      assert.ok(buildingPlan.owner.equals(mock.provider.publicKey))
      assert.ok(buildingPlan.building.equals(buildingPda))
      assert.ok(buildingPlan.price.eq(price))
      assert.equal(buildingPlan.duration, duration)
      assert.equal(buildingPlan.speed, speed)
      assert.ok(buildingPlan.capacity.eq(capacity))
      assert.ok(buildingPlan.slaId.eq(slaId))
      assert.equal(buildingPlan.bump, planBump)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'PlanAdded')
      assert.ok(event.owner.equals(mock.provider.publicKey))
      assert.ok(event.building.equals(buildingPda))
      assert.ok(event.price.eq(price))
      assert.equal(event.duration, duration)
      assert.equal(event.speed, speed)
      assert.ok(event.capacity.eq(capacity))
      assert.ok(event.slaId.eq(slaId))
    })

    test('cannot add a plan with the same parameters', async () => {
      const price = new BN(100).mul(USDC_DECIMALS)
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
            caller: mock.provider.publicKey,
            building: buildingPda,
            plan: planPda,
          })
          .signers([mock.provider])
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

    test('adds second plan with different parameters to the same building', async () => {
      const price = new BN(10).mul(USDC_DECIMALS)
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
          caller: mock.provider.publicKey,
          building: buildingPda,
          plan: planPda,
        })
        .signers([mock.provider])
        .transaction()

      const txDetails = await client.processTransaction(tx)

      const plan = await program.account.plan.fetch(planPda)

      assert.ok(plan.owner.equals(mock.provider.publicKey))
      assert.ok(plan.building.equals(buildingPda))
      assert.ok(plan.price.eq(price))
      assert.equal(plan.duration, duration)
      assert.equal(plan.speed, speed)
      assert.ok(plan.capacity.eq(capacity))
      assert.ok(plan.slaId.eq(slaId))
      assert.equal(plan.bump, planBump)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'PlanAdded')
      assert.ok(event.owner.equals(mock.provider.publicKey))
      assert.ok(event.building.equals(buildingPda))
      assert.ok(event.price.eq(price))
      assert.equal(event.duration, duration)
      assert.equal(event.speed, speed)
      assert.ok(event.capacity.eq(capacity))
      assert.ok(event.slaId.eq(slaId))
    })

    // REMOVE

    test('cannot remove a plan that does not exist', async () => {
      const badPlan = Keypair.generate()

      try {
        await program.methods
          .removePlan()
          .accounts({
            caller: mock.provider.publicKey,
            building: buildingPda,
            plan: badPlan.publicKey,
          })
          .signers([mock.provider])
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

    test('cannot remove a plan that is not owned by the caller', async () => {
      const price = new BN(100).mul(USDC_DECIMALS)
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

    test('removes the plan', async () => {
      const price = new BN(10).mul(USDC_DECIMALS)
      const duration = 60
      const speed = 2_000
      const capacity = new BN(2000)
      const slaId = new BN(2)

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
          caller: mock.provider.publicKey,
          building: buildingPda,
          plan: planPda,
        })
        .signers([mock.provider])
        .transaction()

      const txDetails = await client.processTransaction(tx)

      try {
        await program.account.plan.fetch(planPda)
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof Error)
        const err: Error = error
        assert.strictEqual(
          err.message,
          'Account does not exist or has no data ' + planPda.toString(),
        )
      }

      // make sure event was emitted
      const event = await getEvent<PlanRemoved>(
        program,
        txDetails,
        'PlanRemoved',
      )
      assert.ok(event.plan.equals(planPda))
      assert.ok(event.building.equals(buildingPda))
    })
  })
