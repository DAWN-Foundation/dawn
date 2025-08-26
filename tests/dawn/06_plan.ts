import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError, Wallet } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { PublicKey, SendTransactionError, SystemProgram } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'

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
  getOrganizationPda,
  getLocalDomainPda,
  getAuthMethodPda,
  MacAddress,
  getDevicePda,
  getIpLeasePda,
} from '../../sdk/utils'
import {
  createPSKMethodParams,
  serializePSKMethodParams,
} from '../../sdk/utils/auth'
import { getPskAuthMethodPda } from '../../sdk/pda/amf'
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

export const planTests = () =>
  describe('dawn::plan', () => {
    let program: Program<Dawn>
    let provider: BankrunProvider
    let authMethods: PublicKey[]

    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.serviceProvider)
      anchor.setProvider(provider)

      program = anchor.workspace.DAWN as Program<Dawn>

      authMethods = []

      // Create PSK method parameters
      const params1 = createPSKMethodParams({
        ssid: 'DawnTestNetwork1',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })
      const params2 = createPSKMethodParams({
        ssid: 'DawnTestNetwork2',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })
      const parametersBuffer1 = serializePSKMethodParams(params1)
      const parametersBuffer2 = serializePSKMethodParams(params2)
      const [pskAuthMethodPda1] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        parametersBuffer1,
      )
      const [pskAuthMethodPda2] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        parametersBuffer2,
      )

      // Register the auth method on-chain
      await program.methods
        .registerAuthMethod({ psk: {} }, Array.from(parametersBuffer1))
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          config: mock.configPda,
          authMethod: pskAuthMethodPda1,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      await program.methods
        .registerAuthMethod({ psk: {} }, Array.from(parametersBuffer2))
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          config: mock.configPda,
          authMethod: pskAuthMethodPda2,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      const localDomainPda = getLocalDomainPda(
        program,
        mock.serviceProvider.publicKey,
        mock.localDomain,
      )

      try {
        await program.methods
          .addL3Plan(
            mock.planName,
            price,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: mock.serviceProvider.publicKey,
            localDomain: localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: planPda,
            distributionDomain: distributionDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL3Plan(
            mock.planName,
            mock.planPrice,
            duration,
            mock.planSpeed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: mock.serviceProvider.publicKey,
            localDomain: mock.localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: planPda,
            distributionDomain: distributionDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL3Plan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            speed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: mock.serviceProvider.publicKey,
            localDomain: mock.localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: planPda,
            distributionDomain: distributionDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
          .signers([mock.serviceProvider])
          .rpc()
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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          mock.planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL3Plan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: wallet.publicKey,
            localDomain: mock.localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: mock.planPda,
            distributionDomain: distributionDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
          .signers([wallet.payer])
          .rpc()
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

    test('cannot add more than 2 auth methods', async () => {
      const p2 = serializePSKMethodParams(
        createPSKMethodParams({
          ssid: 'test1',
          securityStandard: 'WPA3_PSK',
          encryptionAlgorithm: 'AES_GCMP',
          pskRotationInterval: 86400, // 24 hours
        }),
      )
      const [m1] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        p2,
      )

      const p3 = serializePSKMethodParams(
        createPSKMethodParams({
          ssid: 'test2',
          securityStandard: 'WPA3_PSK',
          encryptionAlgorithm: 'AES_GCMP',
          pskRotationInterval: 86400, // 24 hours
        }),
      )
      const [m2] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        p3,
      )

      const p4 = serializePSKMethodParams(
        createPSKMethodParams({
          ssid: 'test3',
          securityStandard: 'WPA3_PSK',
          encryptionAlgorithm: 'AES_GCMP',
          pskRotationInterval: 86400, // 24 hours
        }),
      )
      const [m3] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        p4,
      )

      const authMethods = [m1, m2, m3] // 3 auth methods should fail

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          mock.planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL3Plan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: mock.serviceProvider.publicKey,
            localDomain: mock.localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: mock.planPda,
            distributionDomain: distributionDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
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
      const duplicateAuthMethods = [authMethods[0], authMethods[0]]

      // Create distribution domain PDA for L3 plan
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          mock.planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL3Plan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: mock.serviceProvider.publicKey,
            localDomain: mock.localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: mock.planPda,
            distributionDomain: distributionDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            duplicateAuthMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL3Plan(
            name,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: mock.serviceProvider.publicKey,
            localDomain: mock.localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: planPda,
            distributionDomain: distributionDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL3Plan(
            name,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: mock.serviceProvider.publicKey,
            localDomain: mock.localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: planPda,
            distributionDomain: distributionDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
          .signers([mock.serviceProvider])
          .rpc()
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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          mock.planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      const tx = await program.methods
        .addL3Plan(
          mock.planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
        )
        .accountsStrict({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: mock.planPda,
          distributionDomain: distributionDomainPda,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(
          authMethods.map((pubkey) => ({
            pubkey,
            isWritable: false,
            isSigner: false,
          })),
        )
        .signers([mock.serviceProvider])
        .transaction()

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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          mock.planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL3Plan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: mock.serviceProvider.publicKey,
            localDomain: mock.localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: mock.planPda,
            distributionDomain: distributionDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
          .signers([mock.serviceProvider])
          .rpc()

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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      const tx = await program.methods
        .addL3Plan(name, price, duration, speed, capacity, null)
        .accountsStrict({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          distributionDomain: distributionDomainPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([mock.serviceProvider])
        .transaction()

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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL3Plan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            startAt,
          )
          .accountsStrict({
            caller: mock.serviceProvider.publicKey,
            localDomain: mock.localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: planPda,
            distributionDomain: distributionDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL3Plan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            startAt,
          )
          .accountsStrict({
            caller: mock.serviceProvider.publicKey,
            localDomain: mock.localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: planPda,
            distributionDomain: distributionDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
          .signers([mock.serviceProvider])
          .rpc()
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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      const tx = await program.methods
        .addL3Plan(
          mock.planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          startAt,
        )
        .accountsStrict({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          distributionDomain: distributionDomainPda,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(
          authMethods.map((pubkey) => ({
            pubkey,
            isWritable: false,
            isSigner: false,
          })),
        )
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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      await program.methods
        .addL3Plan(
          mock.planName,
          mock.planPrice,
          mock.planDuration,
          speed,
          mock.planCapacity,
          startAt,
        )
        .accountsStrict({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          distributionDomain: distributionDomainPda,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(
          authMethods.map((pubkey) => ({
            pubkey,
            isWritable: false,
            isSigner: false,
          })),
        )
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

      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      await program.methods
        .addL3Plan(
          planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          distributionDomain: distributionDomainPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Create an auth method for this specific device
      const authMethodType: AuthMethodType = { psk: {} }
      const paramsBuffer = Buffer.alloc(256, 1) // Simple test parameters
      const paramsArray = Array.from(paramsBuffer)

      const authMethodPda = getAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        authMethodType,
        paramsBuffer,
      )

      await program.methods
        .registerAuthMethod(authMethodType as any, paramsArray)
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          config: mock.configPda,
          authMethod: authMethodPda,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Add the auth method to the plan
      await program.methods
        .addAuthMethod()
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          plan: planPda,
          authMethod: authMethodPda,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

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

      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      await program.methods
        .addL3Plan(
          planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
        )
        .accountsStrict({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          distributionDomain: distributionDomainPda,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([
          {
            pubkey: authMethods[0],
            isWritable: false,
            isSigner: false,
          },
        ])
        .rpc()

      try {
        await program.methods
          .addAuthMethod()
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            plan: planPda,
            authMethod: authMethods[0],
            device: mock.devicePda,
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

    test('adds multiple auth methods to plan successfully', async () => {
      // Create a plan with 2 auth methods
      const planName = 'test plan multiple auth methods'

      const p1 = serializePSKMethodParams(
        createPSKMethodParams({
          ssid: 'test1',
          securityStandard: 'WPA3_PSK',
          encryptionAlgorithm: 'AES_GCMP',
          pskRotationInterval: 86400, // 24 hours
        }),
      )
      const [m1] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        p1,
      )

      const p2 = serializePSKMethodParams(
        createPSKMethodParams({
          ssid: 'test2',
          securityStandard: 'WPA3_PSK',
          encryptionAlgorithm: 'AES_GCMP',
          pskRotationInterval: 86400, // 24 hours
        }),
      )

      const [m2] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        p2,
      )

      // Create first auth method
      const pskMethodType: AuthMethodType = { psk: {} }

      await program.methods
        .registerAuthMethod(pskMethodType as any, [...p1])
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          config: mock.configPda,
          authMethod: m1,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Create second auth method
      await program.methods
        .registerAuthMethod(pskMethodType as any, [...p2])
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          config: mock.configPda,
          authMethod: m2,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

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

      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      await program.methods
        .addL3Plan(
          planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          distributionDomain: distributionDomainPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      await program.methods
        .addAuthMethod()
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          plan: planPda,
          authMethod: m1,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      await program.methods
        .addAuthMethod()
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          plan: planPda,
          authMethod: m2,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Verify both auth methods were added
      const plan = await program.account.plan.fetch(planPda)
      expect(plan.authMethods.length).toBe(2)
      expect(plan.authMethods[0].equals(m1)).toBeTruthy()
      expect(plan.authMethods[1].equals(m2)).toBeTruthy()
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

      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      await program.methods
        .addL3Plan(
          planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          distributionDomain: distributionDomainPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

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
      const wrongDomainDeviceOrganizationPda = getOrganizationPda(
        program,
        mock.customer.publicKey,
        { endUser: {} },
        'end_user_organization',
      )
      const wrongDomainDeviceLocationPda = getDeviceLocationPda(
        program,
        wrongDomainDevicePda,
      )

      const loopbackIpLeasePda = getIpLeasePda(1, wrongDomainDevicePda)

      // The addDevice call will create the local domain if it doesn't exist
      await program.methods
        .addDevice(
          wrongDomainDeviceName,
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.devicePlacement,
          wrongDomainDeviceMac,
          differentLocalDomain,
        )
        .accountsPartial({
          caller: mock.customer.publicKey,
          deviceModel: mock.deviceModelPda,
          device: wrongDomainDevicePda,
          organization: wrongDomainDeviceOrganizationPda,
          deviceLocation: wrongDomainDeviceLocationPda,
          localDomain: differentLocalDomainPda,
          rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
          loopbackIpBlock: mock.loopbackIpBlockPda,
          loopbackIpLease: loopbackIpLeasePda,
          rootPtpIpBlock: null,
          ptpIpBlock: null,
          ptpIpLease: null,
          site: null,
        })
        .signers([mock.customer])
        .rpc()

      // Create an auth method for this device (in different domain)
      const authMethodType: AuthMethodType = { psk: {} }
      const paramsBuffer = Buffer.alloc(256, 2)

      const wrongDomainAuthMethodPda = getAuthMethodPda(
        program,
        mock.customer.publicKey,
        authMethodType,
        paramsBuffer,
      )

      await program.methods
        .registerAuthMethod(authMethodType as any, Array.from(paramsBuffer))
        .accountsPartial({
          caller: mock.customer.publicKey,
          config: mock.configPda,
          authMethod: wrongDomainAuthMethodPda,
          device: wrongDomainDevicePda,
        })
        .signers([mock.customer])
        .rpc()

      // Try to add this auth method to the plan - should fail
      try {
        await program.methods
          .addAuthMethod()
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            plan: planPda,
            authMethod: wrongDomainAuthMethodPda,
            device: wrongDomainDevicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
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

      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      await program.methods
        .addL3Plan(
          planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          distributionDomain: distributionDomainPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Create 4 auth methods and devices
      const authMethods: PublicKey[] = []

      for (let i = 0; i < 4; i++) {
        const authMethodType: AuthMethodType = { psk: {} }
        const paramsBuffer = Buffer.alloc(256, i + 10)

        const authMethodPda = getAuthMethodPda(
          program,
          mock.serviceProvider.publicKey,
          authMethodType,
          paramsBuffer,
        )

        await program.methods
          .registerAuthMethod(authMethodType as any, Array.from(paramsBuffer))
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            config: mock.configPda,
            authMethod: authMethodPda,
            device: mock.devicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()

        authMethods.push(authMethodPda)
      }

      // Add first 3 auth methods successfully
      for (let i = 0; i < 3; i++) {
        await program.methods
          .addAuthMethod()
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            plan: planPda,
            authMethod: authMethods[i],
            device: mock.devicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
      }

      // Verify we have 3 auth methods
      let plan = await program.account.plan.fetch(planPda)
      expect(plan.authMethods.length).toBe(3)

      // Try to add the 4th auth method - should fail
      try {
        await program.methods
          .addAuthMethod()
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            plan: planPda,
            authMethod: authMethods[3],
            device: mock.devicePda,
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

      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      await program.methods
        .addL3Plan(
          planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          distributionDomain: distributionDomainPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      const authMethodType: AuthMethodType = { psk: {} }
      const paramsBuffer = Buffer.alloc(256, 8)

      const unauthorizedAuthMethodPda = getAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        authMethodType,
        paramsBuffer,
      )

      await program.methods
        .registerAuthMethod(authMethodType as any, Array.from(paramsBuffer))
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          config: mock.configPda,
          authMethod: unauthorizedAuthMethodPda,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Try to add auth method with different caller (customer) - should fail due to constraint
      try {
        await program.methods
          .addAuthMethod()
          .accountsPartial({
            caller: mock.customer.publicKey,
            plan: planPda,
            authMethod: unauthorizedAuthMethodPda,
            device: mock.devicePda,
          })
          .signers([mock.customer])
          .rpc()
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

      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          planPda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      await program.methods
        .addL3Plan(
          planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: planPda,
          distributionDomain: distributionDomainPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Create an auth method for this device
      const authMethodType: AuthMethodType = { psk: {} }
      const paramsBuffer = Buffer.alloc(256, 9)

      const sameDomainAuthMethodPda = getAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        authMethodType,
        paramsBuffer,
      )

      await program.methods
        .registerAuthMethod(authMethodType as any, Array.from(paramsBuffer))
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          config: mock.configPda,
          authMethod: sameDomainAuthMethodPda,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Add the auth method to the plan - should succeed
      await program.methods
        .addAuthMethod()
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          plan: planPda,
          authMethod: sameDomainAuthMethodPda,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Verify the auth method was added to the plan
      const plan = await program.account.plan.fetch(planPda)
      expect(plan.authMethods.length).toBe(1)
      expect(plan.authMethods[0].equals(sameDomainAuthMethodPda)).toBeTruthy()

      // Verify the auth method points to the correct device
      const authMethod = await program.account.authMethod.fetch(
        sameDomainAuthMethodPda,
      )
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
    let organizationPda: PublicKey
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
        Buffer.from(planAccount.data),
      )

      const subscriptionAccount = await provider.context.banksClient.getAccount(
        mock.subscriptionPda,
      )
      subscription = program.coder.accounts.decode(
        'subscription',
        Buffer.from(subscriptionAccount.data),
      )

      organizationPda = getOrganizationPda(
        program,
        mock.customer.publicKey,
        { endUser: {} },
        'end_user_organization',
      )
      deviceLocationPda = getDeviceLocationPda(program, mock.deviceL2Pda)
      localDomainPda = getLocalDomainPda(
        program,
        mock.customer.publicKey,
        mock.localDomain,
      )

      const loopbackIpLeasePda = getIpLeasePda(1, mock.deviceL2Pda)

      await program.methods
        .addDevice(
          mock.deviceNameL2,
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.devicePlacement,
          [0, 0, 0, 0, 0, 1],
          mock.localDomain,
        )
        .accountsPartial({
          caller: mock.customer.publicKey,
          deviceModel: mock.deviceL2ModelPda,
          device: mock.deviceL2Pda,
          rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
          loopbackIpBlock: mock.loopbackIpBlockPda,
          loopbackIpLease: loopbackIpLeasePda,
          rootPtpIpBlock: mock.rootPtpIpBlockPda,
          ptpIpBlock: mock.ptpIpBlockPda,
          ptpIpLease: mock.ptpIpLeasePda,
          organization: organizationPda,
          deviceLocation: deviceLocationPda,
          localDomain: localDomainPda,
          site: null,
        })
        .signers([mock.customer])
        .rpc()

      authMethods = []

      // Create PSK method parameters
      // Create PSK method parameters
      const params1 = createPSKMethodParams({
        ssid: 'DawnTestNetwork1',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })
      const params2 = createPSKMethodParams({
        ssid: 'DawnTestNetwork2',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })
      const parametersBuffer1 = serializePSKMethodParams(params1)
      const parametersBuffer2 = serializePSKMethodParams(params2)
      const [pskAuthMethodPda1] = getPskAuthMethodPda(
        program,
        mock.customer.publicKey,
        parametersBuffer1,
      )
      const [pskAuthMethodPda2] = getPskAuthMethodPda(
        program,
        mock.customer.publicKey,
        parametersBuffer2,
      )

      // Register the auth method on-chain
      await program.methods
        .registerAuthMethod({ psk: {} }, Array.from(parametersBuffer1))
        .accountsPartial({
          caller: mock.customer.publicKey,
          config: mock.configPda,
          authMethod: pskAuthMethodPda1,
          device: mock.deviceL2Pda,
        })
        .signers([mock.customer])
        .rpc()

      await program.methods
        .registerAuthMethod({ psk: {} }, Array.from(parametersBuffer2))
        .accountsPartial({
          caller: mock.customer.publicKey,
          config: mock.configPda,
          authMethod: pskAuthMethodPda2,
          device: mock.deviceL2Pda,
        })
        .signers([mock.customer])
        .rpc()

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
      const [distributionDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('distribution_domain'),
          plan2Pda.toBuffer(),
          mock.localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      await program.methods
        .addL3Plan(
          mock.planName,
          mock.planPrice,
          mock.planDuration,
          speed,
          mock.planCapacity,
          null,
        )
        .accountsStrict({
          caller: mock.serviceProvider.publicKey,
          localDomain: mock.localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          plan: plan2Pda,
          distributionDomain: distributionDomainPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([mock.serviceProvider])
        .rpc()

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
      const [accessDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('access_domain'),
          resellPlanPda.toBuffer(),
          localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL2Plan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: mock.customer.publicKey,
            localDomain: localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            plan: resellPlanPda,
            parentPlan: plan2Pda,
            subscription: null, // This should cause the error
            accessDomain: accessDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
          .signers([mock.customer])
          .rpc()
        assert.ok(false)
      } catch (error) {
        expect(error instanceof Error).toBeTruthy()
      }
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
      const [accessDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('access_domain'),
          planPda.toBuffer(),
          localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL2Plan(
            mock.planName,
            mock.planPrice,
            duration,
            mock.planSpeed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: mock.customer.publicKey,
            localDomain: localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            subscription: mock.subscriptionPda,
            parentPlan: mock.planPda,
            plan: planPda,
            accessDomain: accessDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
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
      const [accessDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('access_domain'),
          planPda.toBuffer(),
          localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL2Plan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            speed,
            mock.planCapacity,
            null,
          )
          .accountsStrict({
            caller: mock.customer.publicKey,
            localDomain: localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            subscription: mock.subscriptionPda,
            parentPlan: mock.planPda,
            plan: planPda,
            accessDomain: accessDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
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
      const [accessDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('access_domain'),
          planPda.toBuffer(),
          localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addL2Plan(
            mock.planName,
            mock.planPrice,
            mock.planDuration,
            mock.planSpeed,
            capacity,
            null,
          )
          .accountsStrict({
            caller: mock.customer.publicKey,
            localDomain: localDomainPda,
            serviceAgreement: mock.serviceAgreementPda,
            subscription: mock.subscriptionPda,
            parentPlan: mock.planPda,
            plan: planPda,
            accessDomain: accessDomainPda,
            systemProgram: SystemProgram.programId,
          })
          .remainingAccounts(
            authMethods.map((pubkey) => ({
              pubkey,
              isWritable: false,
              isSigner: false,
            })),
          )
          .signers([mock.customer])
          .rpc()
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
      const [accessDomainPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('access_domain'),
          planPda.toBuffer(),
          localDomainPda.toBuffer(),
        ],
        program.programId,
      )

      const addPlanTx = await program.methods
        .addL2Plan(
          mock.planName,
          mock.planPrice,
          mock.planDuration,
          mock.planSpeed,
          mock.planCapacity,
          null,
        )
        .accountsStrict({
          caller: mock.customer.publicKey,
          localDomain: localDomainPda,
          serviceAgreement: mock.serviceAgreementPda,
          subscription: mock.subscriptionPda,
          parentPlan: mock.planPda,
          plan: planPda,
          accessDomain: accessDomainPda,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(
          authMethods.map((pubkey) => ({
            pubkey,
            isWritable: false,
            isSigner: false,
          })),
        )
        .signers([mock.customer])
        .transaction()

      const txDetails = await confirmTx(provider, addPlanTx)

      // make sure event was emitted
      const event = await getEvent<PlanAdded>(program, txDetails, 'planAdded')
      expect(event.owner.equals(mock.customer.publicKey)).toBeTruthy()
      expect(event.accessDomain.equals(accessDomainPda)).toBeTruthy()
      expect(event.localDomain.equals(localDomainPda)).toBeTruthy()
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
      expect(plan.localDomain.equals(localDomainPda)).toBeTruthy()
      expect(plan.accessDomain.equals(accessDomainPda)).toBeTruthy()
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
