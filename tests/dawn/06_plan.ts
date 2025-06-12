import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError, Wallet } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { Keypair, PublicKey, SendTransactionError } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'

import { Dawn } from '../../target/types/dawn'
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
  getAccessDomainPda,
  AuthMethodType,
  getOrganizationPda,
  getLocalDomainPda,
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'
import { l2devicePda } from './04_device'

export let oneDayLaterPlanPda: PublicKey

interface PlanAdded {
  owner: PublicKey
  device: PublicKey
  accessDomain?: PublicKey
  parentPlan?: PublicKey
  name: string
  price: BN
  duration: number
  speed: number
  capacity: BN
  createdAt: number
  serviceAgreement: PublicKey
  authMethods: AuthMethodType[]
  startAt: BN
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

      program = anchor.workspace.DAWN as Program<Dawn>;

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
        mock.accessDomainPda,
        mock.devicePda,
        null,
        mock.planName,
        price,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      try {
        await program.methods
          .addPlan(
            mock.planName,
            price,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            accessDomain: mock.accessDomainPda,
            device: mock.devicePda,
            serviceAgreement: mock.serviceAgreementPda,
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
        mock.accessDomainPda,
        mock.devicePda,
        null,
        mock.planName,
        mock.planPrice,
        duration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            duration,
            mock.planSpeed,
            mock.planCapacity,
            null,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            accessDomain: mock.accessDomainPda,
            device: mock.devicePda,
            serviceAgreement: mock.serviceAgreementPda,
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
        mock.accessDomainPda,
        mock.devicePda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        speed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            speed,
            mock.planCapacity,
            null,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            accessDomain: mock.accessDomainPda,
            device: mock.devicePda,
            serviceAgreement: mock.serviceAgreementPda,
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

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: wallet.publicKey,
            accessDomain: mock.accessDomainPda,
            device: mock.devicePda,
            serviceAgreement: mock.serviceAgreementPda,
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

    test('cannot add more than 2 auth methods', async () => {
      const authMethods: AuthMethodType[] = [
        { mpsk: {} },
        { wpa2Enterprise: {} },
        { wpa3Enterprise: {} },
      ]

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
            authMethods,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            accessDomain: mock.accessDomainPda,
            device: mock.devicePda,
            serviceAgreement: mock.serviceAgreementPda,
            parentPlan: null,
            subscription: null,
            plan: mock.planPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Too many auth methods')
      }
    })

    test('cannot add duplicate auth methods', async () => {
      const authMethods: AuthMethodType[] = [
        { wpa2Enterprise: {} },
        { wpa2Enterprise: {} },
      ]

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
            authMethods,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            accessDomain: mock.accessDomainPda,
            device: mock.devicePda,
            serviceAgreement: mock.serviceAgreementPda,
            parentPlan: null,
            subscription: null,
            plan: mock.planPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Duplicate auth methods')
      }
    })

    test('cannot add plan with name length eq 0', async () => {
      const name = ''

      const [planPda] = getPlanPda(
        program,
        mock.accessDomainPda,
        mock.devicePda,
        null,
        name,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      try {
        await program.methods
          .addPlan(
            name,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            accessDomain: mock.accessDomainPda,
            device: mock.devicePda,
            serviceAgreement: mock.serviceAgreementPda,
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
        assert.strictEqual(err.error.errorMessage, 'Plan name is empty')
      }
    })

    test('cannot add plan with name length gt 32', async () => {
      const name = 'a'.repeat(33)

      const [planPda] = getPlanPda(
        program,
        mock.accessDomainPda,
        mock.devicePda,
        null,
        name,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      try {
        await program.methods
          .addPlan(
            name,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            accessDomain: mock.accessDomainPda,
            device: mock.devicePda,
            serviceAgreement: mock.serviceAgreementPda,
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
        assert.strictEqual(err.error.errorMessage, 'Plan name is too long')
      }
    })

    test('adds the plan', async () => {
      const tx = await program.methods
        .addPlan(
          mock.planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
          mock.planAuthMethods,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          accessDomain: mock.accessDomainPda,
          device: mock.devicePda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: mock.planPda,
          parentPlan: null,
          subscription: null,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'planAdded')
      assert.ok(event.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(event.device.equals(mock.devicePda))
      assert.ok(event.parentPlan === null)
      assert.ok(event.name === mock.planName)
      assert.ok(event.price.eq(mock.planPrice))
      assert.equal(event.duration, mock.planDuration)
      assert.equal(event.speed, mock.planSpeed)
      assert.ok(event.capacity.eq(mock.planCapacity))
      assert.ok(event.serviceAgreement.equals(mock.serviceAgreementPda))
      expect(event.authMethods[0]).toStrictEqual(mock.planAuthMethods[0])
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()
      assert.ok(event.startAt.eq(new BN(0)))

      // make sure account was created
      const plan = await program.account.plan.fetch(mock.planPda)
      assert.ok(plan.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(plan.device.equals(mock.devicePda))
      assert.ok(plan.parentPlan === null)
      assert.ok(plan.name === mock.planName)
      assert.ok(plan.price.eq(mock.planPrice))
      assert.equal(plan.duration, mock.planDuration)
      assert.equal(plan.speed, mock.planSpeed)
      assert.ok(plan.capacity.eq(mock.planCapacity))
      assert.ok(plan.serviceAgreement.equals(mock.serviceAgreementPda))
      expect(plan.authMethods[0]).toStrictEqual(mock.planAuthMethods[0])
      assert.ok(plan.startAt.eq(new BN(0)))
      assert.equal(plan.bump, mock.planBump)
      expect(new BN(plan.createdAt).gt(new BN(0))).toBeTruthy()
    })

    test('cannot add a plan with the same parameters', async () => {
      // small wait to make sure the tx is confirmed
      await new Promise((resolve) => setTimeout(resolve, 300))

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            accessDomain: mock.accessDomainPda,
            device: mock.devicePda,
            serviceAgreement: mock.serviceAgreementPda,
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
      const name = 'test plan 2'
      const price = new BN(10).mul(USDC_DECIMALS)
      const duration = 60
      const speed = 2_000
      const capacity = new BN(2000)

      const [planPda, planBump] = getPlanPda(
        program,
        mock.accessDomainPda,
        mock.devicePda,
        null,
        name,
        price,
        duration,
        speed,
        capacity,
        null,
        mock.serviceAgreementPda,
      )

      const tx = await program.methods
        .addPlan(name, price, duration, speed, capacity, null, [
          { wpa2Enterprise: {} },
          { ipsecAh: {} },
        ])
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          accessDomain: mock.accessDomainPda,
          device: mock.devicePda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          parentPlan: null,
          subscription: null,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'planAdded')
      assert.ok(event.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(event.device.equals(mock.devicePda))
      assert.ok(event.price.eq(price))
      assert.equal(event.duration, duration)
      assert.equal(event.speed, speed)
      assert.ok(event.capacity.eq(capacity))
      assert.ok(event.serviceAgreement.equals(mock.serviceAgreementPda))
      expect(event.authMethods[0]).toStrictEqual({ wpa2Enterprise: {} })
      expect(event.authMethods[1]).toStrictEqual({ ipsecAh: {} })
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
      assert.ok(plan.serviceAgreement.equals(mock.serviceAgreementPda))
      expect(plan.authMethods[0]).toStrictEqual({ wpa2Enterprise: {} })
      expect(plan.authMethods[1]).toStrictEqual({ ipsecAh: {} })
      assert.equal(plan.bump, planBump)
    })

    test('adds a plan to L2 device with access domain', async () => {
      const [planPda, planBump] = getPlanPda(
        program,
        null,
        l2devicePda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const tx = await program.methods
        .addPlan(
          mock.planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
          mock.planAuthMethods,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          accessDomain: null,
          device: l2devicePda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          parentPlan: null,
          subscription: null,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      const event = await getEvent<PlanAdded>(program, txDetails, 'planAdded')
      expect(event.accessDomain).toBeNull()

      const plan = await program.account.plan.fetch(planPda)
      expect(plan.accessDomain).toBeNull()
    })

    test('cannot add a plan with a start time in the past', async () => {
      const oneDayAgo = new Date()
      oneDayAgo.setDate(oneDayAgo.getDate() - 1)
      const startAt = new BN(oneDayAgo.getTime() / 1000)

      const [planPda] = getPlanPda(
        program,
        mock.accessDomainPda,
        mock.devicePda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        startAt,
        mock.serviceAgreementPda,
      )

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            startAt,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            accessDomain: mock.accessDomainPda,
            device: mock.devicePda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: planPda,
            parentPlan: null,
            subscription: null,
          })
          .signers([mock.serviceProvider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Invalid start time')
      }
    })

    test('cannot add a plan with a start time more than 6 months in the future', async () => {
      const sixMonthsLater = new Date()
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6)
      const startAt = new BN(sixMonthsLater.getTime() / 1000)

      const [planPda] = getPlanPda(
        program,
        mock.accessDomainPda,
        mock.devicePda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        startAt,
        mock.serviceAgreementPda,
      )

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            startAt,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            accessDomain: mock.accessDomainPda,
            device: mock.devicePda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: planPda,
            parentPlan: null,
            subscription: null,
          })
          .signers([mock.serviceProvider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Invalid start time')
      }
    })

    test('adds a plan with a start time 1 day in the future', async () => {
      // 1 day from now
      const oneDayLater = new Date()
      oneDayLater.setDate(oneDayLater.getDate() + 1)
      const startAt = new BN(oneDayLater.getTime() / 1000)

      const [planPda] = getPlanPda(
        program,
        mock.accessDomainPda,
        mock.devicePda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        startAt,
        mock.serviceAgreementPda,
      )

      oneDayLaterPlanPda = planPda

      const tx = await program.methods
        .addPlan(
          mock.planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          startAt,
          mock.planAuthMethods,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          accessDomain: mock.accessDomainPda,
          device: mock.devicePda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          parentPlan: null,
          subscription: null,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'planAdded')
      expect(event.startAt.eq(startAt)).toBeTruthy()

      // make sure account was created
      const plan = await program.account.plan.fetch(planPda)
      expect(plan.startAt.eq(startAt)).toBeTruthy()
    })

    test('adds a plan with a start time 6 months in the future', async () => {
      const sixMonthsLater = new Date()
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 5)
      sixMonthsLater.setDate(sixMonthsLater.getDate() + 25)
      const startAt = new BN(sixMonthsLater.getTime() / 1000)

      const speed = 600 // to have new PDA

      const [planPda] = getPlanPda(
        program,
        mock.accessDomainPda,
        mock.devicePda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        speed,
        mock.planCapacity,
        startAt,
        mock.serviceAgreementPda,
      )

      const tx = await program.methods
        .addPlan(
          mock.planName,
          mock.planPrice,
          mock.planDuration,
          speed,
          mock.planCapacity,
          startAt,
          mock.planAuthMethods,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          accessDomain: mock.accessDomainPda,
          device: mock.devicePda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          parentPlan: null,
          subscription: null,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // const txDetails = await confirmTx(provider, tx)

      // // make sure event was emitted
      // const event = await getEvent<PlanAdded>(program, txDetails, 'PlanAdded')
      // expect(event.startAt.eq(startAt)).toBeTruthy()

      // // make sure account was created
      // const plan = await program.account.plan.fetch(planPda)
      // expect(plan.startAt.eq(startAt)).toBeTruthy()
    })
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
    let organizationPda: PublicKey
    let accessDomainPda: PublicKey
    let deviceLocationPda: PublicKey
    let localDomainPda: PublicKey

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.customer)
      anchor.setProvider(provider)

      program = anchor.workspace.DAWN as Program<Dawn>;

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
        mock.deviceName,
        [0, 0, 0, 0, 0, 1],
      )
      organizationPda = getOrganizationPda(
        program,
        mock.customer.publicKey,
        { endUser: {} },
        'end_user_organization',
      )
      accessDomainPda = getAccessDomainPda(program, devicePda)
      deviceLocationPda = getDeviceLocationPda(program, devicePda)
      localDomainPda = getLocalDomainPda(program, mock.customer.publicKey, mock.localDomain)

      await program.methods
        .addDevice(
          mock.deviceName,
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.devicePlacement,
          [0, 0, 0, 0, 0, 1],
          mock.localDomain,
        )
        .accountsPartial({
          caller: mock.customer.publicKey,
          deviceModel: mock.deviceModelPda,
          device: devicePda,
          organization: organizationPda,
          accessDomain: accessDomainPda,
          deviceLocation: deviceLocationPda,
          localDomain: localDomainPda,
          site: null,
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
      // const program2 = new Program<Dawn>(IDL, PROGRAM_ID, provider)
      // create new plan
      const speed = 240
      const [plan2Pda] = getPlanPda(
        program,
        mock.accessDomainPda,
        mock.devicePda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        speed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      await program.methods
        .addPlan(
          mock.planName,
          mock.planPrice,
          mock.planDuration,
          speed,
          mock.planCapacity,
          null,
          mock.planAuthMethods,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          device: mock.devicePda,
          accessDomain: mock.accessDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: plan2Pda,
          parentPlan: null,
          subscription: null,
        })
        .signers([mock.serviceProvider])
        .rpc()

      provider.wallet = new Wallet(mock.customer)

      const [resellPlanPda] = getPlanPda(
        program,
        accessDomainPda,
        devicePda,
        plan2Pda,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.customer.publicKey,
            accessDomain: accessDomainPda,
            device: devicePda,
            serviceAgreement: mock.serviceAgreementPda,
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
        accessDomainPda,
        devicePda,
        mock.planPda,
        mock.planName,
        mock.planPrice,
        duration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            duration,
            mock.planSpeed,
            mock.planCapacity,
            null,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.customer.publicKey,
            accessDomain: accessDomainPda,
            device: devicePda,
            serviceAgreement: mock.serviceAgreementPda,
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
        accessDomainPda,
        devicePda,
        mock.planPda,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        speed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            speed,
            mock.planCapacity,
            null,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.customer.publicKey,
            accessDomain: accessDomainPda,
            device: devicePda,
            serviceAgreement: mock.serviceAgreementPda,
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
        accessDomainPda,
        devicePda,
        mock.planPda,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        capacity,
        null,
        mock.serviceAgreementPda,
      )

      try {
        await program.methods
          .addPlan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            capacity,
            null,
            mock.planAuthMethods,
          )
          .accountsPartial({
            caller: mock.customer.publicKey,
            accessDomain: accessDomainPda,
            device: devicePda,
            serviceAgreement: mock.serviceAgreementPda,
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
        accessDomainPda,
        devicePda,
        mock.planPda, // parent plan
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const addPlanTx = await program.methods
        .addPlan(
          mock.planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
          mock.planAuthMethods,
        )
        .accountsPartial({
          caller: mock.customer.publicKey,
          accessDomain: accessDomainPda,
          device: devicePda,
          serviceAgreement: mock.serviceAgreementPda,
          subscription: mock.subscriptionPda,
          parentPlan: mock.planPda,
          plan: planPda,
        })
        .signers([mock.customer])
        .transaction()

      const txDetails = await confirmTx(provider, addPlanTx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'planAdded')
      expect(event.owner.equals(mock.customer.publicKey)).toBeTruthy()
      expect(event.accessDomain.equals(accessDomainPda)).toBeTruthy()
      expect(event.device.equals(devicePda)).toBeTruthy()
      expect(event.parentPlan.equals(mock.planPda)).toBeTruthy()
      expect(event.name).toBe(mock.planName)
      expect(event.price.eq(mock.planPrice)).toBeTruthy()
      expect(event.duration).toBe(mock.planDuration)
      expect(event.speed).toBe(mock.planSpeed)
      expect(event.capacity.eq(mock.planCapacity)).toBeTruthy()
      expect(event.startAt.eq(new BN(0))).toBeTruthy()
      expect(
        event.serviceAgreement.equals(mock.serviceAgreementPda),
      ).toBeTruthy()
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure account was created
      const plan = await program.account.plan.fetch(planPda)
      expect(new BN(plan.createdAt).gt(new BN(0))).toBeTruthy()
      expect(plan.owner.equals(mock.customer.publicKey)).toBeTruthy()
      expect(plan.accessDomain.equals(accessDomainPda)).toBeTruthy()
      expect(plan.device.equals(devicePda)).toBeTruthy()
      expect(plan.parentPlan.equals(mock.planPda)).toBeTruthy()
      expect(plan.name).toBe(mock.planName)
      expect(plan.price.eq(mock.planPrice)).toBeTruthy()
      expect(plan.duration).toBe(mock.planDuration)
      expect(plan.speed).toBe(mock.planSpeed)
      expect(plan.capacity.eq(mock.planCapacity)).toBeTruthy()
      expect(plan.startAt.eq(new BN(0))).toBeTruthy()
      expect(
        plan.serviceAgreement.equals(mock.serviceAgreementPda),
      ).toBeTruthy()
      expect(plan.bump).toBe(planBump)
    })
  })
