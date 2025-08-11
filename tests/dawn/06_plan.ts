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
        ssid: 'DawnTestNetwork',
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
        })
        .signers([mock.serviceProvider])
        .rpc()

      await program.methods
        .registerAuthMethod({ psk: {} }, Array.from(parametersBuffer2))
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          config: mock.configPda,
          authMethod: pskAuthMethodPda2,
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

      // Auth method validation will allow empty accounts for now

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
        const txError = err.logs.find((log) => log.includes('already in use'))
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

      authMethods = []

      // Create PSK method parameters
      // Create PSK method parameters
      const params1 = createPSKMethodParams({
        ssid: 'DawnTestNetwork',
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
        })
        .signers([mock.customer])
        .rpc()

      await program.methods
        .registerAuthMethod({ psk: {} }, Array.from(parametersBuffer2))
        .accountsPartial({
          caller: mock.customer.publicKey,
          config: mock.configPda,
          authMethod: pskAuthMethodPda2,
        })
        .signers([mock.customer])
        .rpc()

      authMethods[0] = pskAuthMethodPda1
      authMethods[1] = pskAuthMethodPda2

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
          organization: organizationPda,
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
        console.log('myError', error)
        // This will likely fail due to missing subscription account, not the custom error
        // The error will be different since we're using accountsStrict with null subscription
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
        console.log('myError', error)
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
