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
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'

interface PlanAdded {
  owner: PublicKey
  device: PublicKey
  price: BN
  duration: number
  speed: number
  capacity: BN
  slaId: BN
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
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'PlanAdded')
      assert.ok(event.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(event.device.equals(mock.devicePda))
      assert.ok(event.price.eq(mock.planPrice))
      assert.equal(event.duration, mock.planDuration)
      assert.equal(event.speed, mock.planSpeed)
      assert.ok(event.capacity.eq(mock.planCapacity))
      assert.ok(event.slaId.eq(mock.planSlaId))

      // make sure account was created
      const plan = await program.account.plan.fetch(mock.planPda)
      assert.ok(plan.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(plan.device.equals(mock.devicePda))
      assert.ok(plan.price.eq(mock.planPrice))
      assert.equal(plan.duration, mock.planDuration)
      assert.equal(plan.speed, mock.planSpeed)
      assert.ok(plan.capacity.eq(mock.planCapacity))
      assert.ok(plan.slaId.eq(mock.planSlaId))
      assert.equal(plan.bump, mock.planBump)
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

      // make sure account was created
      const plan = await program.account.plan.fetch(planPda)
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

    test('cannot remove a plan that does not exist', async () => {
      const badPlan = Keypair.generate()

      try {
        await program.methods
          .removePlan()
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: mock.devicePda,
            plan: badPlan.publicKey,
          })
          .signers([mock.serviceProvider])
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
        mock.devicePda,
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
            device: mock.devicePda,
            plan: planPda,
          })
          .signers([wallet.payer])
          .rpc()
        assert.ok(false)
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('A raw constraint was violated')
        expect(err.error.errorCode.number).toBe(2003)
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
        mock.devicePda,
        price,
        duration,
        speed,
        capacity,
        slaId,
      )

      const tx = await program.methods
        .removePlan()
        .accounts({
          caller: mock.serviceProvider.publicKey,
          device: mock.devicePda,
          plan: planPda,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      try {
        await program.account.plan.fetch(planPda)
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof Error)
        const err: Error = error
        assert.strictEqual(err.message, 'Could not find ' + planPda.toString())
      }

      // make sure event was emitted
      const event = await getEvent<PlanRemoved>(
        program,
        txDetails,
        'PlanRemoved',
      )
      assert.ok(event.plan.equals(planPda))
      assert.ok(event.device.equals(mock.devicePda))
    })
  })
