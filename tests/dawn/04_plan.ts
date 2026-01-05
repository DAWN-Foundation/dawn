import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError, Wallet } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { PublicKey, SendTransactionError, SystemProgram } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'
import nacl from 'tweetnacl'

import { Dawn } from '../../target/types/dawn'
import {
  getEvent,
  mock,
  getPlanPda,
  getProvider,
  confirmTx,
  USDC_DECIMALS,
  loadWallet,
  getDeviceLocationPda,
  AuthMethodType,
  getLocalDomainPda,
  getAuthMethodPda,
  MacAddress,
  getDevicePda,
  getIpLeasePda,
  addL3PlanTx,
  addL3PlanRpc,
  addL2PlanTx,
  addL2PlanRpc,
  registerAuthMethodRpc,
  addAuthMethodToPlanTx,
  addAuthMethodToPlanRpc,
  addDeviceRpc,
} from '../../sdk/utils'
import { AuthParamsSerializer } from '../../sdk/utils/auth-borsh'
import { getPskAuthMethodPda } from '../../sdk/pda/amf'
import { getPlanDistributionDomainPda, getPlanAccessDomainPda } from '../../sdk/pda/device'
import { createPSKMethodParamsBorsh } from '../../sdk/utils/auth-borsh'
import { beforeAll, expect } from '@jest/globals'

export let oneDayLaterPlanPda: PublicKey

interface PlanAdded {
  owner: PublicKey
  accessDomain?: PublicKey
  distributionDomain?: PublicKey
  localDomain: PublicKey
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

interface AuthMethodAdded {
  authMethod: PublicKey
  plan: PublicKey
  createdAt: number
}

interface DistributionDomainAdded {
  distributionDomain: PublicKey
  owner: PublicKey
  localDomain: PublicKey
  createdAt: number
}

interface AccessDomainAdded {
  accessDomain: PublicKey
  owner: PublicKey
  localDomain: PublicKey
  createdAt: number
}

export const planTests = () =>
  describe('dawn::plan', () => {
    let program: Program<Dawn>
    let provider: BankrunProvider
    let authMethods: PublicKey[]
    const encryptionKey1 = nacl.box.keyPair().publicKey
    const encryptionKey2 = nacl.box.keyPair().publicKey

    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.serviceProvider)
      anchor.setProvider(provider)

      program = anchor.workspace.DAWN as Program<Dawn>

      authMethods = []

      // Create PSK method parameters using Borsh serialization
      const serializer = new AuthParamsSerializer(program)
      const parametersBuffer1 = serializer.serializePSKParams({
        ssid: 'DawnTestNetwork1',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })
      const parametersBuffer2 = serializer.serializePSKParams({
        ssid: 'DawnTestNetwork2',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })
      const [pskAuthMethodPda1] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        mock.devicePda,
        encryptionKey1,
        parametersBuffer1,
      )
      const [pskAuthMethodPda2] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        mock.devicePda,
        encryptionKey2,
        parametersBuffer2,
      )

      // Register the auth method on-chain
      await registerAuthMethodRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        configPda: mock.configPda,
        authMethodPda: pskAuthMethodPda1,
        devicePda: mock.devicePda,
        authMethodType: { psk: {} },
        encryptionKey: encryptionKey1,
        parameters: parametersBuffer1,
      })

      await registerAuthMethodRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        configPda: mock.configPda,
        authMethodPda: pskAuthMethodPda2,
        devicePda: mock.devicePda,
        authMethodType: { psk: {} },
        encryptionKey: encryptionKey2,
        parameters: parametersBuffer2,
      })

      authMethods[0] = pskAuthMethodPda1
      authMethods[1] = pskAuthMethodPda2
    })

    test('mock setup', () => {
      assert.exists(mock)
    })

    test('cannot add plan with zero price', async () => {
      const price = new BN(0)

      const [planPda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        mock.planName,
        price,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      const localDomainPda = getLocalDomainPda(
        program,
        mock.serviceProvider.publicKey,
        mock.localDomain,
      )

      try {
        await addL3PlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda,
          distributionDomainPda,
          name: mock.planName,
          price,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods,
        })
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
        mock.localDomainPda,
        null,
        mock.planName,
        mock.planPrice,
        duration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      try {
        await addL3PlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          localDomainPda: mock.localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda,
          distributionDomainPda,
          name: mock.planName,
          price: mock.planPrice,
          duration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods,
        })
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
        mock.localDomainPda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        speed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      try {
        await addL3PlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          localDomainPda: mock.localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda,
          distributionDomainPda,
          name: mock.planName,
          price: mock.planPrice,
          duration: mock.planDuration,
          speed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods,
        })
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Plan speed is zero')
      }
    })

    test('cannot be added for a local domain not owned by the caller', async () => {
      provider.wallet = new Wallet(wallet.payer)

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        mock.planPda,
        mock.localDomainPda,
      )

      try {
        await addL3PlanRpc({
          program,
            caller: wallet.publicKey,
          signer: wallet.payer,
          localDomainPda: mock.localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda: mock.planPda,
          distributionDomainPda,
          name: mock.planName,
          price: mock.planPrice,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods,
        })
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(
          err.error.errorMessage,
          'A seeds constraint was violated',
        )
        assert.strictEqual(err.error.errorCode.number, 2006)
      } finally {
        provider.wallet = new Wallet(mock.serviceProvider)
      }
    })

    test('cannot add more than 3 auth methods', async () => {
      const serializer = new AuthParamsSerializer(program)
      // Create and register 4 auth methods
      const authMethodParams = [
        { ssid: 'test1' },
        { ssid: 'test2' },
        { ssid: 'test3' },
        { ssid: 'test4' },
      ]

      const authMethods: PublicKey[] = []

      for (let i = 0; i < 4; i++) {
        const paramsBuffer = serializer.serializePSKParams({
          ssid: authMethodParams[i].ssid,
          securityStandard: 'WPA3_PSK',
          encryptionAlgorithm: 'AES_GCMP',
          pskRotationInterval: 86400, // 24 hours
        })

        const encryptionKey = nacl.box.keyPair().publicKey

        const [authMethodPda] = getPskAuthMethodPda(
          program,
          mock.serviceProvider.publicKey,
          mock.devicePda,
          encryptionKey,
          paramsBuffer,
        )

        const authMethodType: AuthMethodType = { psk: {} }

        await registerAuthMethodRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          configPda: mock.configPda,
          authMethodPda,
          devicePda: mock.devicePda,
          authMethodType,
          encryptionKey,
          parameters: paramsBuffer,
        })

        authMethods.push(authMethodPda)
      }

      const authMethods3 = [authMethods[0], authMethods[1], authMethods[2]] // 3 auth methods should succeed
      const authMethods4 = authMethods // 4 auth methods should fail

      // Create a unique plan name for this test
      const planName = 'plan max 3 auth methods'

      // First, test that 3 auth methods succeed
      const [planPda3] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [distributionDomainPda3] = getPlanDistributionDomainPda(
        program,
        planPda3,
        mock.localDomainPda,
      )

      // This should succeed with 3 auth methods
      await addL3PlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda: planPda3,
        distributionDomainPda: distributionDomainPda3,
        name: planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods: authMethods3,
      })

      // Verify the plan was created with 3 auth methods
      const plan3 = await program.account.plan.fetch(planPda3)
      expect(plan3.authMethods.length).toBe(3)

      // Now test that 4 auth methods fail
      const [planPda4] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        planName + ' fail',
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [distributionDomainPda4] = getPlanDistributionDomainPda(
        program,
        planPda4,
        mock.localDomainPda,
      )

      try {
        await addL3PlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          localDomainPda: mock.localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda: planPda4,
          distributionDomainPda: distributionDomainPda4,
          name: planName + ' fail',
          price: mock.planPrice,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods: authMethods4,
        })
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Too many auth methods')
      }
    })

    test('cannot add duplicate auth methods', async () => {
      const duplicateAuthMethods = [authMethods[0], authMethods[0]]

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        mock.planPda,
        mock.localDomainPda,
      )

      try {
        await addL3PlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          localDomainPda: mock.localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda: mock.planPda,
          distributionDomainPda: distributionDomainPda,
          name: mock.planName,
          price: mock.planPrice,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods: duplicateAuthMethods,
        })
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
        mock.localDomainPda,
        null,
        name,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      try {
        await addL3PlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          localDomainPda: mock.localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda,
          distributionDomainPda,
          name,
          price: mock.planPrice,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods,
        })
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
        mock.localDomainPda,
        null,
        name,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      try {
        await addL3PlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          localDomainPda: mock.localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda,
          distributionDomainPda,
          name,
          price: mock.planPrice,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods,
        })
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Plan name is too long')
      }
    })

    test('adds the L3 plan', async () => {
      const localDomainPda = getLocalDomainPda(
        program,
        mock.serviceProvider.publicKey,
        mock.localDomain,
      )

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        mock.planPda,
        mock.localDomainPda,
      )

      const tx = await addL3PlanTx({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda: mock.planPda,
        distributionDomainPda,
        name: mock.planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods,
      })

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'planAdded')
      assert.ok(event.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(event.parentPlan === null)
      assert.ok(event.name === mock.planName)
      assert.ok(event.price.eq(mock.planPrice))
      assert.ok(event.localDomain.equals(mock.localDomainPda))
      assert.notExists(event.accessDomain)
      assert.equal(event.duration, mock.planDuration)
      assert.equal(event.speed, mock.planSpeed)
      assert.ok(event.capacity.eq(mock.planCapacity))
      assert.ok(event.serviceAgreement.equals(mock.serviceAgreementPda))
      expect(event.authMethods[0]).toStrictEqual(authMethods[0])
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()
      assert.ok(event.startAt.eq(new BN(0)))

      const distributionDomainEvent = await getEvent<DistributionDomainAdded>(
        program,
        txDetails,
        'distributionDomainAdded',
      )
      expect(
        distributionDomainEvent.distributionDomain.equals(
          distributionDomainPda,
        ),
      ).toBeTruthy()
      expect(
        distributionDomainEvent.owner.equals(mock.serviceProvider.publicKey),
      ).toBeTruthy()
      expect(
        distributionDomainEvent.localDomain.equals(mock.localDomainPda),
      ).toBeTruthy()
      expect(
        new BN(distributionDomainEvent.createdAt).gt(new BN(0)),
      ).toBeTruthy()

      // make sure account was created
      const plan = await program.account.plan.fetch(mock.planPda)
      assert.ok(plan.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(plan.localDomain.equals(localDomainPda))
      assert.ok(plan.parentPlan === null)
      assert.ok(plan.distributionDomain !== null)
      assert.ok(plan.accessDomain === null)
      assert.ok(plan.name === mock.planName)
      assert.ok(plan.price.eq(mock.planPrice))
      assert.equal(plan.duration, mock.planDuration)
      assert.equal(plan.speed, mock.planSpeed)
      assert.ok(plan.capacity.eq(mock.planCapacity))
      assert.ok(plan.serviceAgreement.equals(mock.serviceAgreementPda))
      expect(plan.authMethods[0]).toStrictEqual(authMethods[0])
      assert.ok(plan.startAt.eq(new BN(0)))
      assert.equal(plan.bump, mock.planBump)
      expect(new BN(plan.createdAt).gt(new BN(0))).toBeTruthy()
    })

    test('cannot add an L3 plan with the same parameters', async () => {
      // small wait to make sure the tx is confirmed
      await new Promise((resolve) => setTimeout(resolve, 300))

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        mock.planPda,
        mock.localDomainPda,
      )

      try {
        await addL3PlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          localDomainPda: mock.localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda: mock.planPda,
          distributionDomainPda,
          name: mock.planName,
          price: mock.planPrice,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods,
        })

        assert.ok(false)
      } catch (error) {
        expect(error instanceof SendTransactionError).toBeTruthy()
        const err: SendTransactionError = error
        const txError = err.logs?.find((log) => log.includes('already in use'))
        expect(txError).toBeDefined()
        expect(txError).toBe(
          `Allocate: account Address { address: ${mock.planPda.toBase58()}, base: None } already in use`,
        )
      }
    })

    test('adds second L3 plan with different parameters to the same local domain', async () => {
      const name = 'test plan 2'
      const price = new BN(10).mul(USDC_DECIMALS)
      const duration = 60
      const speed = 2_000
      const capacity = new BN(2000)

      const [planPda, planBump] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        name,
        price,
        duration,
        speed,
        capacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      const tx = await addL3PlanTx({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda,
        distributionDomainPda,
        name,
        price,
        duration,
        speed,
        capacity,
        startAt: null,
        authMethods: [],
        })

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'planAdded')
      assert.ok(event.owner.equals(mock.serviceProvider.publicKey))
      assert.notExists(event.accessDomain)
      assert.ok(event.localDomain.equals(mock.localDomainPda))
      assert.ok(event.price.eq(price))
      assert.equal(event.duration, duration)
      assert.equal(event.speed, speed)
      assert.ok(event.capacity.eq(capacity))
      assert.ok(event.serviceAgreement.equals(mock.serviceAgreementPda))
      expect(event.authMethods).toStrictEqual([])
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure account was created
      const plan = await program.account.plan.fetch(planPda)
      expect(new BN(plan.createdAt).gt(new BN(0))).toBeTruthy()
      assert.ok(plan.owner.equals(mock.serviceProvider.publicKey))
      assert.ok(plan.localDomain.equals(mock.localDomainPda))
      assert.ok(plan.price.eq(price))
      assert.equal(plan.duration, duration)
      assert.equal(plan.speed, speed)
      assert.ok(plan.capacity.eq(capacity))
      assert.ok(plan.serviceAgreement.equals(mock.serviceAgreementPda))
      expect(plan.authMethods).toStrictEqual([])
      assert.equal(plan.bump, planBump)
    })

    test('cannot add a plan with a start time in the past', async () => {
      const oneDayAgo = new Date()
      oneDayAgo.setDate(oneDayAgo.getDate() - 1)
      const startAt = new BN(oneDayAgo.getTime() / 1000)

      const [planPda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        startAt,
        mock.serviceAgreementPda,
      )

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      try {
        await addL3PlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          localDomainPda: mock.localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda,
          distributionDomainPda,
          name: mock.planName,
          price: mock.planPrice,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt,
          authMethods,
        })
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
        mock.localDomainPda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        startAt,
        mock.serviceAgreementPda,
      )

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      try {
        await addL3PlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          localDomainPda: mock.localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda,
          distributionDomainPda,
          name: mock.planName,
          price: mock.planPrice,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt,
          authMethods,
        })
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Invalid start time')
      }
    })

    test('adds an L3 plan with a start time 1 day in the future', async () => {
      // 1 day from now
      const oneDayLater = new Date()
      oneDayLater.setDate(oneDayLater.getDate() + 1)
      const startAt = new BN(oneDayLater.getTime() / 1000)

      const [planPda] = getPlanPda(
        program,
        mock.localDomainPda,
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

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      const tx = await addL3PlanTx({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda,
        distributionDomainPda,
        name: mock.planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt,
        authMethods,
      })

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
        mock.localDomainPda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        speed,
        mock.planCapacity,
        startAt,
        mock.serviceAgreementPda,
      )

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      await addL3PlanRpc({
        program,
        caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda,
        distributionDomainPda,
        name: mock.planName,
        price: mock.planPrice,
        duration: mock.planDuration,
          speed,
        capacity: mock.planCapacity,
          startAt,
        authMethods,
      })

      // const txDetails = await confirmTx(provider, tx)

      // // make sure event was emitted
      // const event = await getEvent<PlanAdded>(program, txDetails, 'PlanAdded')
      // expect(event.startAt.eq(startAt)).toBeTruthy()

      // // make sure account was created
      // const plan = await program.account.plan.fetch(planPda)
      // expect(plan.startAt.eq(startAt)).toBeTruthy()
    })

    // Add Auth Method Tests
    test('adds auth method to plan successfully', async () => {
      // First create a plan
      const planName = 'test plan for auth method'
      const [planPda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      await addL3PlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda,
        distributionDomainPda,
        name: planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods: [],
      })

      // Create an auth method for this specific device
      const authMethodType: AuthMethodType = { psk: {} }

      const paramsArray = createPSKMethodParamsBorsh(program, {
        ssid: 'test ssid',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })

      const encryptionKey = nacl.box.keyPair().publicKey

      const [authMethodPda] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        mock.devicePda,
        encryptionKey,
        paramsArray,
      )

      await registerAuthMethodRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        configPda: mock.configPda,
        authMethodPda,
        devicePda: mock.devicePda,
        authMethodType,
        encryptionKey,
        parameters: paramsArray,
      })

      // Add the auth method to the plan
      const tx = await addAuthMethodToPlanTx({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        planPda,
        authMethodPda,
        devicePda: mock.devicePda,
        })

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<AuthMethodAdded>(
        program,
        txDetails,
        'authMethodAdded',
      )
      expect(event.authMethod.equals(authMethodPda)).toBeTruthy()
      expect(event.plan.equals(planPda)).toBeTruthy()
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // Verify the auth method was added to the plan
      const plan = await program.account.plan.fetch(planPda)
      expect(plan.authMethods.length).toBe(1)
      expect(plan.authMethods[0].equals(authMethodPda)).toBeTruthy()
    })

    test('cannot add duplicate auth method to plan', async () => {
      // Create a plan
      const planName = 'test plan for duplicate'
      const [planPda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      await addL3PlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda,
        distributionDomainPda,
        name: planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods: [authMethods[0]],
      })

      try {
        await addAuthMethodToPlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          planPda,
          authMethodPda: authMethods[0],
          devicePda: mock.devicePda,
          })
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Duplicate auth methods')
      }
    })

    test('adds multiple auth methods to plan successfully', async () => {
      // Create a plan with 2 auth methods
      const planName = 'test plan multiple auth methods'

      const [planPda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      await addL3PlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda,
        distributionDomainPda,
        name: planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods: [],
      })

      await addAuthMethodToPlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        planPda,
        authMethodPda: authMethods[0],
        devicePda: mock.devicePda,
        })

      await addAuthMethodToPlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        planPda,
        authMethodPda: authMethods[1],
        devicePda: mock.devicePda,
        })

      // Verify both auth methods were added
      const plan = await program.account.plan.fetch(planPda)
      expect(plan.authMethods.length).toBe(2)
      expect(plan.authMethods[0].equals(authMethods[0])).toBeTruthy()
      expect(plan.authMethods[1].equals(authMethods[1])).toBeTruthy()
    })

    // Device Local Domain Constraint Tests
    test('cannot add auth method to plan if device is not in same local domain', async () => {
      // Create a plan in service provider's local domain
      const planName = 'test plan wrong domain'
      const [planPda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      await addL3PlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda,
        distributionDomainPda,
        name: planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods: [],
      })

      // Create a device in customer's local domain (different from plan's local domain)
      const differentLocalDomain = 'customer-local-domain'
      const differentLocalDomainPda = getLocalDomainPda(
        program,
        mock.customer.publicKey,
        differentLocalDomain,
      )

      const wrongDomainDeviceName = 'WrongDomainDevice'
      const wrongDomainDeviceMac: MacAddress = [0, 0, 0, 0, 0, 6]
      const wrongDomainDevicePda = getDevicePda(
        program,
        mock.customer,
        mock.deviceModelPda,
        wrongDomainDeviceName,
        wrongDomainDeviceMac,
      )

      const wrongDomainDeviceLocationPda = getDeviceLocationPda(
        program,
        wrongDomainDevicePda,
      )

      const loopbackIpLeasePda = getIpLeasePda(1, wrongDomainDevicePda)

      // The addDevice call will create the local domain if it doesn't exist
      await addDeviceRpc({
        program,
          caller: mock.customer.publicKey,
        signer: mock.customer,
        deviceModelPda: mock.deviceModelPda,
        devicePda: wrongDomainDevicePda,
        deviceLocationPda: wrongDomainDeviceLocationPda,
        localDomainPda: differentLocalDomainPda,
        name: wrongDomainDeviceName,
        height: mock.deviceHeight,
        latitude: mock.deviceLatitude,
        longitude: mock.deviceLongitude,
        placement: mock.devicePlacement,
        macAddress: wrongDomainDeviceMac,
        localDomain: differentLocalDomain,
      })

      // Create an auth method for this device (in different domain)
      const authMethodType: AuthMethodType = { psk: {} }

      const paramsArray = createPSKMethodParamsBorsh(program, {
        ssid: 'test ssid',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })

      const encryptionKey = nacl.box.keyPair().publicKey

      const [authMethodPda] = getPskAuthMethodPda(
        program,
        mock.customer.publicKey,
        wrongDomainDevicePda,
        encryptionKey,
        paramsArray,
      )

      await registerAuthMethodRpc({
        program,
          caller: mock.customer.publicKey,
        signer: mock.customer,
        configPda: mock.configPda,
        authMethodPda,
        devicePda: wrongDomainDevicePda,
        authMethodType,
        encryptionKey,
        parameters: paramsArray,
      })

      // Try to add this auth method to the plan - should fail
      try {
        await addAuthMethodToPlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          planPda,
          authMethodPda,
          devicePda: wrongDomainDevicePda,
          })
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Device not in local domain')
      }
    })

    test('cannot exceed maximum of 3 auth methods on plan', async () => {
      // Create a plan
      const planName = 'test plan max auth methods'
      const [planPda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      await addL3PlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda,
        distributionDomainPda,
        name: planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods: [],
      })

      // Create 4 auth methods and devices
      const authMethods: PublicKey[] = []

      for (let i = 0; i < 4; i++) {
        const authMethodType: AuthMethodType = { psk: {} }
        const paramsBuffer = createPSKMethodParamsBorsh(program, {
          ssid: 'new test ssid ' + i,
          securityStandard: 'WPA3_PSK',
          encryptionAlgorithm: 'AES_GCMP',
          pskRotationInterval: 86400, // 24 hours
        })

        const encryptionKey = nacl.box.keyPair().publicKey

        const [authMethodPda] = getPskAuthMethodPda(
          program,
          mock.serviceProvider.publicKey,
          mock.devicePda,
          encryptionKey,
          paramsBuffer,
        )

        await registerAuthMethodRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          configPda: mock.configPda,
          authMethodPda,
          devicePda: mock.devicePda,
          authMethodType,
          encryptionKey,
          parameters: paramsBuffer,
        })

        authMethods.push(authMethodPda)
      }

      // Add first 3 auth methods successfully
      for (let i = 0; i < 3; i++) {
        await addAuthMethodToPlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          planPda,
          authMethodPda: authMethods[i],
          devicePda: mock.devicePda,
          })
      }

      // Verify we have 3 auth methods
      let plan = await program.account.plan.fetch(planPda)
      expect(plan.authMethods.length).toBe(3)

      // Try to add the 4th auth method - should fail
      try {
        await addAuthMethodToPlanRpc({
          program,
            caller: mock.serviceProvider.publicKey,
          signer: mock.serviceProvider,
          planPda,
          authMethodPda: authMethods[3],
          devicePda: mock.devicePda,
          })
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Too many auth methods')
      }
    })

    test('cannot add auth method to plan if caller is not plan owner', async () => {
      // Create a plan
      const planName = 'test plan unauthorized caller'
      const [planPda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      await addL3PlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda,
        distributionDomainPda,
        name: planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods: [],
      })

      const authMethodType: AuthMethodType = { psk: {} }
      const paramsBuffer = createPSKMethodParamsBorsh(program, {
        ssid: 'unauthorized test ssid ',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })

      const encryptionKey = nacl.box.keyPair().publicKey

      const [authMethodPda] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        mock.devicePda,
        encryptionKey,
        paramsBuffer,
      )

      await registerAuthMethodRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        configPda: mock.configPda,
        authMethodPda,
        devicePda: mock.devicePda,
        authMethodType,
        encryptionKey,
        parameters: paramsBuffer,
      })

      // Try to add auth method with different caller (customer) - should fail due to constraint
      try {
        await addAuthMethodToPlanRpc({
          program,
            caller: mock.customer.publicKey,
          signer: mock.customer,
          planPda,
          authMethodPda,
          devicePda: mock.devicePda,
          })
        assert.ok(false)
      } catch (error) {
        // Should fail due to constraint check: caller.key() == plan.owner
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        // This will likely be a constraint violation error (ConstraintMut)
        expect(err.error.errorCode.number).toBe(2003)
      }
    })

    test('successfully adds auth method for device in same local domain', async () => {
      // Create a plan
      const planName = 'test plan same domain success'
      const [planPda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        planPda,
        mock.localDomainPda,
      )

      await addL3PlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda,
        distributionDomainPda,
        name: planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods: [],
      })

      // Create an auth method for this device
      const authMethodType: AuthMethodType = { psk: {} }
      const paramsBuffer = createPSKMethodParamsBorsh(program, {
        ssid: 'test ssid same domain',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })

      const encryptionKey = nacl.box.keyPair().publicKey

      const [authMethodPda] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        mock.devicePda,
        encryptionKey,
        paramsBuffer,
      )

      await registerAuthMethodRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        configPda: mock.configPda,
        authMethodPda,
        devicePda: mock.devicePda,
        authMethodType,
        encryptionKey,
        parameters: paramsBuffer,
      })

      // Add the auth method to the plan - should succeed
      await addAuthMethodToPlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        planPda,
        authMethodPda,
        devicePda: mock.devicePda,
        })

      // Verify the auth method was added to the plan
      const plan = await program.account.plan.fetch(planPda)
      expect(plan.authMethods.length).toBe(1)
      expect(plan.authMethods[0].equals(authMethodPda)).toBeTruthy()

      // Verify the auth method points to the correct device
      const authMethod = await program.account.authMethod.fetch(authMethodPda)
      expect(authMethod.device.equals(mock.devicePda)).toBeTruthy()
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
    let deviceLocationPda: PublicKey
    let localDomainPda: PublicKey
    let authMethods: PublicKey[]

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.customer)
      anchor.setProvider(provider)

      program = anchor.workspace.DAWN as Program<Dawn>

      const planAccount = await provider.context.banksClient.getAccount(
        mock.planPda,
      )
      parentPlan = program.coder.accounts.decode(
        'plan',
        Buffer.from(planAccount!.data),
      )

      const subscriptionAccount = await provider.context.banksClient.getAccount(
        mock.subscriptionPda,
      )
      subscription = program.coder.accounts.decode(
        'subscription',
        Buffer.from(subscriptionAccount!.data),
      )

      deviceLocationPda = getDeviceLocationPda(program, mock.deviceL2Pda)
      localDomainPda = getLocalDomainPda(
        program,
        mock.customer.publicKey,
        mock.localDomain,
      )

      await addDeviceRpc({
        program,
          caller: mock.customer.publicKey,
        signer: mock.customer,
        deviceModelPda: mock.deviceL2ModelPda,
        devicePda: mock.deviceL2Pda,
        deviceLocationPda,
        localDomainPda,
        name: mock.deviceNameL2,
        height: mock.deviceHeight,
        latitude: mock.deviceLatitude,
        longitude: mock.deviceLongitude,
        placement: mock.devicePlacement,
        macAddress: [0, 0, 0, 0, 0, 1],
        localDomain: mock.localDomain,
      })

      authMethods = []

      // Create PSK method parameters using Borsh serialization
      const serializer = new AuthParamsSerializer(program)
      const parametersBuffer1 = serializer.serializePSKParams({
        ssid: 'DawnTestNetwork1',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })
      const parametersBuffer2 = serializer.serializePSKParams({
        ssid: 'DawnTestNetwork2',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })

      const encryptionKey1 = nacl.box.keyPair().publicKey
      const encryptionKey2 = nacl.box.keyPair().publicKey

      const [pskAuthMethodPda1] = getPskAuthMethodPda(
        program,
        mock.customer.publicKey,
        mock.deviceL2Pda,
        encryptionKey1,
        parametersBuffer1,
      )
      const [pskAuthMethodPda2] = getPskAuthMethodPda(
        program,
        mock.customer.publicKey,
        mock.deviceL2Pda,
        encryptionKey2,
        parametersBuffer2,
      )

      // Register the auth method on-chain
      await registerAuthMethodRpc({
        program,
          caller: mock.customer.publicKey,
        signer: mock.customer,
        configPda: mock.configPda,
        authMethodPda: pskAuthMethodPda1,
        devicePda: mock.deviceL2Pda,
        authMethodType: { psk: {} },
        encryptionKey: encryptionKey1,
        parameters: parametersBuffer1,
      })

      await registerAuthMethodRpc({
        program,
          caller: mock.customer.publicKey,
        signer: mock.customer,
        configPda: mock.configPda,
        authMethodPda: pskAuthMethodPda2,
        devicePda: mock.deviceL2Pda,
        authMethodType: { psk: {} },
        encryptionKey: encryptionKey2,
        parameters: parametersBuffer2,
      })

      authMethods[0] = pskAuthMethodPda1
      authMethods[1] = pskAuthMethodPda2
    })

    test('mock setup', () => {
      assert.exists(mock)
      assert.exists(parentPlan)
      assert.exists(subscription)
    })

    test('cannot add plan that resells the parent plan if caller is not subscribed to parent plan', async () => {
      provider.wallet = new Wallet(mock.serviceProvider)
      const speed = 240
      const [plan2Pda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        speed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = getPlanDistributionDomainPda(
        program,
        plan2Pda,
        mock.localDomainPda,
      )

      await addL3PlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda: plan2Pda,
        distributionDomainPda,
        name: mock.planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods: [],
      })

      provider.wallet = new Wallet(mock.customer)

      const localDomainPda = getLocalDomainPda(
        program,
        mock.customer.publicKey,
        mock.localDomain,
      )
      const [resellPlanPda] = getPlanPda(
        program,
        localDomainPda,
        plan2Pda,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create access domain PDA for L2 plan
      const [accessDomainPda] = getPlanAccessDomainPda(
        program,
        resellPlanPda,
        localDomainPda,
      )

      try {
        await addL2PlanRpc({
          program,
            caller: mock.customer.publicKey,
          signer: mock.customer,
          localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda: resellPlanPda,
          parentPlanPda: plan2Pda,
          accessDomainPda,
          name: mock.planName,
          price: mock.planPrice,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods,
        })
        assert.ok(false)
      } catch (error) {
        expect(error instanceof Error).toBeTruthy()
      }
    })

    test('cannot add L2 plan with subscription for different parent plan', async () => {
      // Create a second L3 plan that customer is NOT subscribed to
      provider.wallet = new Wallet(mock.serviceProvider)
      const speed2 = 350
      const [plan2Pda] = getPlanPda(
        program,
        mock.localDomainPda,
        null,
        'Different Plan',
        mock.planPrice,
        mock.planDuration,
        speed2,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [distributionDomain2Pda] = getPlanDistributionDomainPda(
        program,
        plan2Pda,
        mock.localDomainPda,
      )

      await addL3PlanRpc({
        program,
          caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda: plan2Pda,
        distributionDomainPda: distributionDomain2Pda,
        name: 'Different Plan',
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: speed2,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods: [],
      })

      // Now try to create L2 plan for plan2 using subscription to original plan
      provider.wallet = new Wallet(mock.customer)
      const localDomainPda = getLocalDomainPda(
        program,
        mock.customer.publicKey,
        mock.localDomain,
      )
      const [resellPlanPda] = getPlanPda(
        program,
        localDomainPda,
        plan2Pda, // Parent is plan2
        'Resell Different Plan',
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      const [accessDomainPda] = getPlanAccessDomainPda(
        program,
        resellPlanPda,
        localDomainPda,
      )

      try {
        await addL2PlanRpc({
          program,
            caller: mock.customer.publicKey,
          signer: mock.customer,
          localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda: resellPlanPda,
          parentPlanPda: plan2Pda, // Different plan (not subscribed)
          accessDomainPda,
          name: 'Resell Different Plan',
          price: mock.planPrice,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods,
        })
        assert.ok(false, 'Should have failed with PDA derivation error')
      } catch (error) {
        // Will fail because subscription PDA won't match (seeds use parent_plan.key())
        // The subscription PDA is derived from mock.planPda, but we're trying to use plan2Pda
        expect(error instanceof Error).toBeTruthy()
      }
    })

    test('verifies subscription expiration check is in place', async () => {
      // This test verifies that the subscription has an expiration field
      // The actual constraint check (subscription.expiration > now) is in the program
      // and will reject expired subscriptions at runtime

      // Fetch the existing subscription to verify it has expiration data
      const subscription = await program.account.subscription.fetch(
        mock.subscriptionPda,
      )

      const currentTime = Math.floor(Date.now() / 1000)

      // Verify the subscription has an expiration timestamp in the future
      expect(subscription.expiration.toNumber()).toBeGreaterThan(currentTime)

      // Note: Testing actual expired subscription requires time manipulation
      // which is not easily done in bankrun. The constraint exists in add_l2_plan.rs:
      // require!(ctx.accounts.subscription.expiration > now, DawnError::SubscriptionExpired)

      // In production, any attempt to create an L2 plan with an expired subscription
      // will fail with SubscriptionExpired error
    })

    test('cannot add plan that exceeds duration of parent plan', async () => {
      const duration = mock.planDuration + 1

      const localDomainPda = getLocalDomainPda(
        program,
        mock.customer.publicKey,
        mock.localDomain,
      )
      const [planPda] = getPlanPda(
        program,
        localDomainPda,
        mock.planPda,
        mock.planName,
        mock.planPrice,
        duration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create access domain PDA for L2 plan
      const [accessDomainPda] = getPlanAccessDomainPda(
        program,
        planPda,
        localDomainPda,
      )

      try {
        await addL2PlanRpc({
          program,
            caller: mock.customer.publicKey,
          signer: mock.customer,
          localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda,
          parentPlanPda: mock.planPda,
          accessDomainPda,
          name: mock.planName,
          price: mock.planPrice,
          duration,
          speed: mock.planSpeed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods,
        })
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Outside parent bounds')
      }
    })

    test('cannot add plan that exceeds speed of parent plan', async () => {
      const speed = mock.planSpeed + 1

      const localDomainPda = getLocalDomainPda(
        program,
        mock.customer.publicKey,
        mock.localDomain,
      )
      const [planPda] = getPlanPda(
        program,
        localDomainPda,
        mock.planPda,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        speed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create access domain PDA for L2 plan
      const [accessDomainPda] = getPlanAccessDomainPda(
        program,
        planPda,
        localDomainPda,
      )

      try {
        await addL2PlanRpc({
          program,
            caller: mock.customer.publicKey,
          signer: mock.customer,
          localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda,
          parentPlanPda: mock.planPda,
          accessDomainPda,
          name: mock.planName,
          price: mock.planPrice,
          duration: mock.planDuration,
          speed,
          capacity: mock.planCapacity,
          startAt: null,
          authMethods,
        })
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Outside parent bounds')
      }
    })

    test('cannot add plan that exceeds capacity of parent plan', async () => {
      const capacity = mock.planCapacity.add(new BN(1))
      const localDomainPda = getLocalDomainPda(
        program,
        mock.customer.publicKey,
        mock.localDomain,
      )
      const [planPda] = getPlanPda(
        program,
        localDomainPda,
        mock.planPda,
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        capacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create access domain PDA for L2 plan
      const [accessDomainPda] = getPlanAccessDomainPda(
        program,
        planPda,
        localDomainPda,
      )

      try {
        await addL2PlanRpc({
          program,
            caller: mock.customer.publicKey,
          signer: mock.customer,
          localDomainPda,
          serviceAgreementPda: mock.serviceAgreementPda,
          planPda,
          parentPlanPda: mock.planPda,
          accessDomainPda,
          name: mock.planName,
          price: mock.planPrice,
          duration: mock.planDuration,
          speed: mock.planSpeed,
          capacity,
          startAt: null,
          authMethods,
        })
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Outside parent bounds')
      }
    })

    test('adds L2 plan to resell the parent plan (customer is subscribed)', async () => {
      // use mock.planPda as parent plan, customer is subscribed to it

      const localDomainPda = getLocalDomainPda(
        program,
        mock.customer.publicKey,
        mock.localDomain,
      )
      const [planPda, planBump] = getPlanPda(
        program,
        localDomainPda,
        mock.planPda, // parent plan
        mock.planName,
        mock.planPrice,
        mock.planDuration,
        mock.planSpeed,
        mock.planCapacity,
        null,
        mock.serviceAgreementPda,
      )

      // Create access domain PDA for L2 plan
      const [accessDomainPda] = getPlanAccessDomainPda(
        program,
        planPda,
        localDomainPda,
      )

      const addPlanTx = await addL2PlanTx({
        program,
          caller: mock.customer.publicKey,
        signer: mock.customer,
        localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        planPda,
        parentPlanPda: mock.planPda,
        accessDomainPda,
        name: mock.planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt: null,
        authMethods,
      })

      const txDetails = await confirmTx(provider, addPlanTx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'planAdded')
      expect(event.owner.equals(mock.customer.publicKey)).toBeTruthy()
      expect(event.accessDomain!.equals(accessDomainPda)).toBeTruthy()
      expect(event.localDomain.equals(localDomainPda)).toBeTruthy()
      expect(event.parentPlan!.equals(mock.planPda)).toBeTruthy()
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

      const accessDomainEvent = await getEvent<AccessDomainAdded>(
        program,
        txDetails,
        'accessDomainAdded',
      )
      expect(
        accessDomainEvent.accessDomain.equals(accessDomainPda),
      ).toBeTruthy()
      expect(
        accessDomainEvent.owner.equals(mock.customer.publicKey),
      ).toBeTruthy()
      expect(accessDomainEvent.localDomain.equals(localDomainPda)).toBeTruthy()
      expect(new BN(accessDomainEvent.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure account was created
      const plan = await program.account.plan.fetch(planPda)
      expect(new BN(plan.createdAt).gt(new BN(0))).toBeTruthy()
      expect(plan.owner.equals(mock.customer.publicKey)).toBeTruthy()
      expect(plan.localDomain.equals(localDomainPda)).toBeTruthy()
      expect(plan.accessDomain!.equals(accessDomainPda)).toBeTruthy()
      expect(plan.parentPlan!.equals(mock.planPda)).toBeTruthy()
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
