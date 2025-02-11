import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError, Wallet } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { Keypair, PublicKey, SendTransactionError } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'

import { Dawn, IDL } from '../../target/types/dawn'
import {
  getEvent,
  mock,
  getPlanPda,
  getProvider,
  PROGRAM_ID,
  confirmTx,
  USDC_DECIMALS,
  loadWallet,
  getDevicePda,
  getDeviceLocationPda,
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'

interface PlanAdded {
  owner: PublicKey
  device: PublicKey
  isResale: boolean
  parentPlan: PublicKey
  price: BN
  duration: number
  speed: number
  capacity: BN
  slaId: BN
  createdAt: number
}

interface PlanRemoved {
  plan: PublicKey
  device: PublicKey
}

export const planTests = () =>
  describe('dawn::plan', () => {
    let program: Program<Dawn>
    let provider: BankrunProvider
    let device: Awaited<ReturnType<typeof program.account.device.fetch>>

    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.serviceProvider)
      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)

      const deviceAccount = await provider.context.banksClient.getAccount(
        mock.devicePda,
      )
      device = program.coder.accounts.decode(
        'device',
        Buffer.from(deviceAccount.data),
      )
    })

    test('mock setup', () => {
      assert.exists(mock)
      assert.exists(device)
      assert.ok(device.owner.equals(mock.serviceProvider.publicKey))
    })

    test('cannot add plan with zero price', async () => {
      const price = new BN(0)

      const [planPda] = getPlanPda(
        program,
        mock.devicePda,
        null,
        price,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        mock.planSlaId,
      )

      try {
        await program.methods
          .addPlan(
            price,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            mock.planSlaId,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: mock.devicePda,
            parentPlan: null,
            subscription: null,
            plan: planPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Plan price is zero')
      }
    })

    test('cannot add plan with zero duration', async () => {
      const duration = 0

      const [planPda] = getPlanPda(
        program,
        mock.devicePda,
        null,
        mock.planPrice,
        duration,
        mock.planSpeed,
        mock.planCapacity,
        mock.planSlaId,
      )

      try {
        await program.methods
          .addPlan(
            mock.planPrice,
            duration,
            mock.planSpeed,
            mock.planCapacity,
            mock.planSlaId,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: mock.devicePda,
            parentPlan: null,
            subscription: null,
            plan: planPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Plan duration is zero')
      }
    })

    test('cannot add plan with zero speed', async () => {
      const speed = 0

      const [planPda] = getPlanPda(
        program,
        mock.devicePda,
        null,
        mock.planPrice,
        mock.planDuration,
        speed,
        mock.planCapacity,
        mock.planSlaId,
      )

      try {
        await program.methods
          .addPlan(
            mock.planPrice,
            mock.planDuration,
            speed,
            mock.planCapacity,
            mock.planSlaId,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: mock.devicePda,
            parentPlan: null,
            subscription: null,
            plan: planPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Plan speed is zero')
      }
    })

    test('cannot be added for a device not owned by the caller', async () => {
      provider.wallet = new Wallet(wallet.payer)
      const program = new Program<Dawn>(IDL, PROGRAM_ID, provider)

      try {
        await program.methods
          .addPlan(
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            mock.planSlaId,
          )
          .accounts({
            caller: wallet.publicKey,
            device: mock.devicePda,
            parentPlan: null,
            subscription: null,
            plan: mock.planPda,
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
      } finally {
        provider.wallet = new Wallet(mock.serviceProvider)
      }
    })

    test('adds the plan', async () => {
      const tx = await program.methods
        .addPlan(
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          mock.planSlaId,
        )
        .accounts({
          caller: mock.serviceProvider.publicKey,
          device: mock.devicePda,
          plan: mock.planPda,
          parentPlan: null,
          subscription: null,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'PlanAdded')
      assert.ok(event.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(event.device.equals(mock.devicePda))
      assert.ok(event.isResale === false)
      assert.ok(event.parentPlan.toBytes().every((byte) => byte === 0))
      assert.ok(event.price.eq(mock.planPrice))
      assert.equal(event.duration, mock.planDuration)
      assert.equal(event.speed, mock.planSpeed)
      assert.ok(event.capacity.eq(mock.planCapacity))
      assert.ok(event.slaId.eq(mock.planSlaId))
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure account was created
      const plan = await program.account.plan.fetch(mock.planPda)
      assert.ok(plan.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(plan.device.equals(mock.devicePda))
      assert.ok(plan.isResale === false)
      assert.ok(plan.parentPlan.toBytes().every((byte) => byte === 0))
      assert.ok(plan.price.eq(mock.planPrice))
      assert.equal(plan.duration, mock.planDuration)
      assert.equal(plan.speed, mock.planSpeed)
      assert.ok(plan.capacity.eq(mock.planCapacity))
      assert.ok(plan.slaId.eq(mock.planSlaId))
      assert.equal(plan.bump, mock.planBump)
      expect(new BN(plan.createdAt).gt(new BN(0))).toBeTruthy()
    })

    test('cannot add a plan with the same parameters', async () => {
      // small wait to make sure the tx is confirmed
      await new Promise((resolve) => setTimeout(resolve, 300))

      try {
        await program.methods
          .addPlan(
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            mock.planSlaId,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: mock.devicePda,
            plan: mock.planPda,
            parentPlan: null,
            subscription: null,
          })
          .signers([mock.serviceProvider])
          .rpc()

        assert.ok(false)
      } catch (error) {
        expect(error instanceof SendTransactionError).toBeTruthy()
        const err: SendTransactionError = error
        const txError = err.logs.find((log) => log.includes('already in use'))
        expect(txError).toBeDefined()
        expect(txError).toBe(
          `Allocate: account Address { address: ${mock.planPda.toBase58()}, base: None } already in use`,
        )
      }
    })

    test('adds second plan with different parameters to the same device', async () => {
      const price = new BN(10).mul(USDC_DECIMALS)
      const duration = 60
      const speed = 2_000
      const capacity = new BN(2000)
      const slaId = new BN(2)

      const [planPda, planBump] = getPlanPda(
        program,
        mock.devicePda,
        null,
        price,
        duration,
        speed,
        capacity,
        slaId,
      )

      const tx = await program.methods
        .addPlan(price, duration, speed, capacity, slaId)
        .accounts({
          caller: mock.serviceProvider.publicKey,
          device: mock.devicePda,
          plan: planPda,
          parentPlan: null,
          subscription: null,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'PlanAdded')
      assert.ok(event.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(event.device.equals(mock.devicePda))
      assert.ok(event.price.eq(price))
      assert.equal(event.duration, duration)
      assert.equal(event.speed, speed)
      assert.ok(event.capacity.eq(capacity))
      assert.ok(event.slaId.eq(slaId))
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure account was created
      const plan = await program.account.plan.fetch(planPda)
      expect(new BN(plan.createdAt).gt(new BN(0))).toBeTruthy()
      assert.ok(plan.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(plan.device.equals(mock.devicePda))
      assert.ok(plan.price.eq(price))
      assert.equal(plan.duration, duration)
      assert.equal(plan.speed, speed)
      assert.ok(plan.capacity.eq(capacity))
      assert.ok(plan.slaId.eq(slaId))
      assert.equal(plan.bump, planBump)
    })

    // REMOVE

    // test('cannot remove a plan that does not exist', async () => {
    //   const badPlan = Keypair.generate()

    //   try {
    //     await program.methods
    //       .removePlan()
    //       .accounts({
    //         caller: mock.serviceProvider.publicKey,
    //         device: mock.devicePda,
    //         plan: badPlan.publicKey,
    //       })
    //       .signers([mock.serviceProvider])
    //       .rpc()
    //     assert.ok(false)
    //   } catch (error) {
    //     assert.ok(error instanceof AnchorError)
    //     const err: AnchorError = error
    //     assert.strictEqual(
    //       err.error.errorMessage,
    //       'The program expected this account to be already initialized',
    //     )
    //     assert.strictEqual(err.error.errorCode.number, 3012)
    //   }
    // })

    // test('cannot remove a plan that is not owned by the caller', async () => {
    //   const price = new BN(100).mul(USDC_DECIMALS)
    //   const duration = 30
    //   const speed = 1_000
    //   const capacity = new BN(1000)
    //   const slaId = new BN(1)

    //   const [planPda] = getPlanPda(
    //     program,
    //     null,
    //     mock.devicePda,
    //     price,
    //     duration,
    //     speed,
    //     capacity,
    //     slaId,
    //   )

    //   try {
    //     await program.methods
    //       .removePlan()
    //       .accounts({
    //         caller: wallet.publicKey,
    //         device: mock.devicePda,
    //         plan: planPda,
    //       })
    //       .signers([wallet.payer])
    //       .rpc()
    //     assert.ok(false)
    //   } catch (error) {
    //     expect(error instanceof AnchorError).toBeTruthy()
    //     const err: AnchorError = error
    //     expect(err.error.errorMessage).toBe('A raw constraint was violated')
    //     expect(err.error.errorCode.number).toBe(2003)
    //   }
    // })

    // test('removes the plan', async () => {
    //   const price = new BN(10).mul(USDC_DECIMALS)
    //   const duration = 60
    //   const speed = 2_000
    //   const capacity = new BN(2000)
    //   const slaId = new BN(2)

    //   const [planPda] = getPlanPda(
    //     program,
    //     null,
    //     mock.devicePda,
    //     price,
    //     duration,
    //     speed,
    //     capacity,
    //     slaId,
    //   )

    //   const tx = await program.methods
    //     .removePlan()
    //     .accounts({
    //       caller: mock.serviceProvider.publicKey,
    //       device: mock.devicePda,
    //       plan: planPda,
    //     })
    //     .signers([mock.serviceProvider])
    //     .transaction()

    //   const txDetails = await confirmTx(provider, tx)

    //   try {
    //     await program.account.plan.fetch(planPda)
    //     assert.ok(false)
    //   } catch (error) {
    //     assert.ok(error instanceof Error)
    //     const err: Error = error
    //     assert.strictEqual(err.message, 'Could not find ' + planPda.toString())
    //   }

    //   // make sure event was emitted
    //   const event = await getEvent<PlanRemoved>(
    //     program,
    //     txDetails,
    //     'PlanRemoved',
    //   )
    //   assert.ok(event.plan.equals(planPda))
    //   assert.ok(event.device.equals(mock.devicePda))
    // })
  })

export const parentPlanTests = () =>
  describe('dawn::parent_plan', () => {
    let program: Program<Dawn>
    let provider: BankrunProvider
    let parentPlan: Awaited<ReturnType<typeof program.account.plan.fetch>>
    let subscription: Awaited<
      ReturnType<typeof program.account.subscription.fetch>
    >
    let devicePda: PublicKey
    let deviceLocationPda: PublicKey

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.customer)
      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)

      const planAccount = await provider.context.banksClient.getAccount(
        mock.planPda,
      )
      parentPlan = program.coder.accounts.decode(
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

      // create new device (as customer)
      devicePda = getDevicePda(
        program,
        mock.customer,
        mock.deviceModelPda,
        [0, 0, 0, 0, 0, 1],
      )

      deviceLocationPda = getDeviceLocationPda(program, devicePda)

      await program.methods
        .addDevice(
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          [0, 0, 0, 0, 0, 1],
        )
        .accounts({
          caller: mock.customer.publicKey,
          deviceModel: mock.deviceModelPda,
          device: devicePda,
          deviceLocation: deviceLocationPda,
        })
        .signers([mock.customer])
        .rpc()
    })

    test('mock setup', () => {
      assert.exists(mock)
      assert.exists(parentPlan)
      assert.exists(subscription)
    })

    test('cannot add plan that resells the parent plan if caller is not subscribed to parent plan', async () => {
      provider.wallet = new Wallet(mock.serviceProvider)
      const program2 = new Program<Dawn>(IDL, PROGRAM_ID, provider)
      // create new plan
      const sla2Id = mock.planSlaId.add(new BN(1))
      const [plan2Pda] = getPlanPda(
        program2,
        mock.devicePda,
        null,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        sla2Id,
      )

      await program2.methods
        .addPlan(
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          sla2Id,
        )
        .accounts({
          caller: mock.serviceProvider.publicKey,
          device: mock.devicePda,
          plan: plan2Pda,
          parentPlan: null,
          subscription: null,
        })
        .signers([mock.serviceProvider])
        .rpc()

      provider.wallet = new Wallet(mock.customer)
      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)

      const [resellPlanPda] = getPlanPda(
        program,
        devicePda,
        plan2Pda,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        mock.planSlaId,
      )

      try {
        await program.methods
          .addPlan(
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            mock.planSlaId,
          )
          .accounts({
            caller: mock.customer.publicKey,
            device: devicePda,
            plan: resellPlanPda,
            parentPlan: plan2Pda,
            subscription: null,
          })
          .signers([mock.customer])
          .rpc()
        assert.ok(false)
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        assert.strictEqual(
          err.error.errorMessage,
          'Parent plan needs subscription',
        )
      }
    })

    test('cannot add plan that exceeds duration of parent plan', async () => {
      const duration = mock.planDuration + 1

      const [planPda] = getPlanPda(
        program,
        devicePda,
        mock.planPda,
        mock.planPrice,
        duration,
        mock.planSpeed,
        mock.planCapacity,
        mock.planSlaId,
      )

      try {
        await program.methods
          .addPlan(
            mock.planPrice,
            duration,
            mock.planSpeed,
            mock.planCapacity,
            mock.planSlaId,
          )
          .accounts({
            caller: mock.customer.publicKey,
            device: devicePda,
            subscription: mock.subscriptionPda,
            parentPlan: mock.planPda,
            plan: planPda,
          })
          .signers([mock.customer])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Outside parent bounds')
      }
    })

    test('cannot add plan that exceeds speed of parent plan', async () => {
      const speed = mock.planSpeed + 1

      const [planPda] = getPlanPda(
        program,
        devicePda,
        mock.planPda,
        mock.planPrice,
        mock.planDuration,
        speed,
        mock.planCapacity,
        mock.planSlaId,
      )

      try {
        await program.methods
          .addPlan(
            mock.planPrice,
            mock.planDuration,
            speed,
            mock.planCapacity,
            mock.planSlaId,
          )
          .accounts({
            caller: mock.customer.publicKey,
            device: devicePda,
            subscription: mock.subscriptionPda,
            parentPlan: mock.planPda,
            plan: planPda,
          })
          .signers([mock.customer])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Outside parent bounds')
      }
    })

    test('cannot add plan that exceeds capacity of parent plan', async () => {
      const capacity = mock.planCapacity.add(new BN(1))

      const [planPda] = getPlanPda(
        program,
        devicePda,
        mock.planPda,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        capacity,
        mock.planSlaId,
      )

      try {
        await program.methods
          .addPlan(
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            capacity,
            mock.planSlaId,
          )
          .accounts({
            caller: mock.customer.publicKey,
            device: devicePda,
            subscription: mock.subscriptionPda,
            parentPlan: mock.planPda,
            plan: planPda,
          })
          .signers([mock.customer])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Outside parent bounds')
      }
    })

    test('adds plan to resell the parent plan (customer is subscribed)', async () => {
      // use mock.planPda as parent plan, customer is subscribed to it

      const [planPda, planBump] = getPlanPda(
        program,
        devicePda,
        mock.planPda, // parent plan
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        mock.planSlaId,
      )

      const addPlanTx = await program.methods
        .addPlan(
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          mock.planSlaId,
        )
        .accounts({
          caller: mock.customer.publicKey,
          device: devicePda,
          subscription: mock.subscriptionPda,
          parentPlan: mock.planPda,
          plan: planPda,
        })
        .signers([mock.customer])
        .transaction()

      const txDetails = await confirmTx(provider, addPlanTx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'PlanAdded')
      assert.ok(event.owner.equals(mock.customer.publicKey))
      assert.ok(event.device.equals(devicePda))
      assert.ok(event.parentPlan.equals(mock.planPda))
      assert.ok(event.price.eq(mock.planPrice))
      assert.equal(event.duration, mock.planDuration)
      assert.equal(event.speed, mock.planSpeed)
      assert.ok(event.capacity.eq(mock.planCapacity))
      assert.ok(event.slaId.eq(mock.planSlaId))
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure account was created
      const plan = await program.account.plan.fetch(planPda)
      expect(new BN(plan.createdAt).gt(new BN(0))).toBeTruthy()
      assert.ok(plan.owner.equals(mock.customer.publicKey))
      assert.ok(plan.device.equals(devicePda))
      assert.ok(plan.parentPlan.equals(mock.planPda))
      assert.ok(plan.price.eq(mock.planPrice))
      assert.equal(plan.duration, mock.planDuration)
      assert.equal(plan.speed, mock.planSpeed)
      assert.ok(plan.capacity.eq(mock.planCapacity))
      assert.ok(plan.slaId.eq(mock.planSlaId))
      assert.equal(plan.bump, planBump)
    })
  })
