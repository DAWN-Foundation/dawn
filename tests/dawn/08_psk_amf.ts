import * as anchor from '@coral-xyz/anchor'
import { Program, Wallet, BN } from '@coral-xyz/anchor'
import { assert } from 'chai'
import nacl from 'tweetnacl'
import { Dawn } from '../../target/types/dawn'
import {
  mock,
  getProvider,
  loadWallet,
  getPlanPda,
  getAccessDomainForPlanPda,
  getSubscriptionPda,
  registerAuthMethodRpc,
  registerCredentialRpc,
  revokeCredentialRpc,
  addL2PlanRpc,
  addAuthMethodToPlanRpc,
  subscribeRpc,
} from '../../sdk/utils'
import {
  serializePskCredentialData,
  createPSKMethodParams,
  serializePSKMethodParams,
} from '../../sdk/utils/auth'
import { encryptWithPublicKey } from '../../sdk/utils/encrypt'
import {
  getPskAuthMethodPda,
  getCredentialPda as getPskCredentialPda,
} from '../../sdk/pda/amf'
import { BankrunProvider } from 'anchor-bankrun'
import { beforeAll, expect } from '@jest/globals'
import { AuthParamsSerializer } from '../../sdk/utils/auth-borsh'
import { SystemProgram } from '@solana/web3.js'
import {
  calculateMinDawnOut,
  BPS_DENOMINATOR,
  getDeadline,
  Q32,
} from './05_subscription'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'

export const pskAmfTests = () =>
  describe('dawn::psk_amf', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>
    let authMethodPda: anchor.web3.PublicKey
    let credentialPda: anchor.web3.PublicKey
    const encryptionKey = nacl.box.keyPair().publicKey

    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = wallet
      anchor.setProvider(provider as any)

      program = anchor.workspace.DAWN as Program<Dawn>
    })

    test('mock setup', () => {
      assert.exists(mock)
    })

    test('registers PSK auth method successfully', async () => {
      // Create PSK method parameters
      const params = createPSKMethodParams({
        ssid: 'DawnTestNetwork',
        securityStandard: 'WPA3_PSK',
        encryptionAlgorithm: 'AES_GCMP',
        pskRotationInterval: 86400, // 24 hours
      })
      const parametersBuffer = serializePSKMethodParams(params)
      const [pskAuthMethodPda] = getPskAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        mock.devicePda,
        encryptionKey,
        parametersBuffer,
      )

      authMethodPda = pskAuthMethodPda

      // Register the auth method on-chain
      const signature = await registerAuthMethodRpc({
        program,
        caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        configPda: mock.configPda,
        authMethodPda,
        devicePda: mock.devicePda,
        authMethodType: { psk: {} },
        encryptionKey,
        parameters: parametersBuffer,
      })

      expect(signature).toBeTruthy()

      // Verify the account was created correctly
      const authMethod = await program.account.authMethod.fetch(authMethodPda)
      expect(authMethod.methodType).toStrictEqual({ psk: {} })
      expect(
        authMethod.authority.equals(mock.serviceProvider.publicKey),
      ).toBeTruthy()
      expect(authMethod.device.equals(mock.devicePda)).toBeTruthy()

      console.log({
        authMethodPda: authMethodPda.toString(),
        signature: signature,
      })
    })

    test('fails to register credential without valid subscription', async () => {
      const unauthorizedKeypair = anchor.web3.Keypair.generate()

      // Fund the unauthorized wallet
      provider.context.setAccount(unauthorizedKeypair.publicKey, {
        lamports: 1000000000, // 1 SOL
        owner: anchor.web3.SystemProgram.programId,
        executable: false,
        data: Buffer.from([]),
      })

      const psk = '0'.repeat(16) // 16 characters for PSK
      const encryptedPsk = encryptWithPublicKey(psk, encryptionKey)
      const serializedParams = serializePskCredentialData(encryptedPsk)

      const unauthorizedCredentialPda = getPskCredentialPda(
        program,
        mock.subscriptionPda,
        mock.planPda,
        authMethodPda,
        anchor.web3.Keypair.generate().publicKey, // Different client
      )

      try {
        // This should fail because unauthorizedKeypair doesn't have a subscription
        await registerCredentialRpc({
          program,
          caller: unauthorizedKeypair.publicKey,
          signer: unauthorizedKeypair,
          authMethodPda,
          planPda: mock.planPda,
          subscriptionPda: mock.subscriptionPda, // This subscription doesn't belong to unauthorizedKeypair
          credentialPda: unauthorizedCredentialPda,
          credentialData: Array.from(serializedParams),
        })

        // Should not reach here
        expect(false).toBe(true)
      } catch (error) {
        expect(error).toBeTruthy()
        // console.log(
        //   'Expected error for unauthorized credential registration:',
        //   error,
        // )
      }
    })

    test('registers client credential for PSK network', async () => {
      const planName = 'test PSK plan'

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

      const accessDomainPda = getAccessDomainForPlanPda(
        program,
        mock.localDomainPda,
        planPda,
      )

      // add L2 plan
      provider.wallet = new Wallet(mock.serviceProvider)
      await addL2PlanRpc({
        program,
        caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        localDomainPda: mock.localDomainPda,
        serviceAgreementPda: mock.serviceAgreementPda,
        parentPlanPda: null as any, // L2 plan without parent
        planPda: planPda,
        accessDomainPda: accessDomainPda,
        name: planName,
        price: mock.planPrice,
        duration: mock.planDuration,
        speed: mock.planSpeed,
        capacity: mock.planCapacity,
        startAt: null,
      })

      // Add AuthMethod to plan
      await addAuthMethodToPlanRpc({
        program,
        caller: mock.serviceProvider.publicKey,
        signer: mock.serviceProvider,
        planPda: planPda,
        authMethodPda,
        devicePda: mock.devicePda,
      })

      const plan = await program.account.plan.fetch(planPda)

      // Customer subscribes to plan
      provider.wallet = new Wallet(mock.customer)
      // get balances of raydium vaults
      const raydiumDawnVault = await getAccount(
        provider.connection,
        mock.raydiumDawnVault,
      )
      const raydiumUsdcVault = await getAccount(
        provider.connection,
        mock.raydiumUsdcVault,
      )

      const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
      const usdcVaultAmount = new BN(raydiumUsdcVault.amount.toString())
      const price = dawnVaultAmount.mul(Q32).div(usdcVaultAmount)

      // Use plan.price for minDawnOut - program will scale it proportionally
      const minDawnOut = calculateMinDawnOut(plan.price, price)
      const deadline = await getDeadline(provider)

      const escrowUsdcVault = await getAssociatedTokenAddress(
        mock.usdcMint,
        planPda,
        true,
      )

      // Create DAWN vault token account for plan escrow
      const escrowDawnVault = await getAssociatedTokenAddress(
        mock.dawnMint,
        planPda,
        true,
      )

      const [subscriptionPda] = getSubscriptionPda(
        program,
        planPda,
        mock.customer.publicKey,
      )

      await subscribeRpc({
        program,
        minDawnOut,
        deadline,
        caller: mock.customer.publicKey,
        signer: mock.customer,
        config: mock.configPda,
        plan: planPda,
        device: null,
        subscription: subscriptionPda,
        usdcMint: mock.usdcMint,
        dawnMint: mock.dawnMint,
        raydium: mock.raydium,
        raydiumAuthority: mock.raydiumAuthority,
        raydiumConfig: mock.raydiumConfig,
        raydiumPool: mock.raydiumPool,
        raydiumObservation: mock.raydiumObservation,
        raydiumDawnVault: mock.raydiumDawnVault,
        raydiumUsdcVault: mock.raydiumUsdcVault,
        userUsdcAccount: mock.customerUsdcAccount,
        userDawnAccount: mock.customerDawnAccount,
        feePoolDawnAccount: mock.feePoolDawnAccount,
        escrowUsdcVault: escrowUsdcVault,
        escrowDawnVault: escrowDawnVault,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })

      const psk = '0'.repeat(16) // 16 characters for PSK

      const encryptedPsk = encryptWithPublicKey(psk, encryptionKey)
      const serializedParams = serializePskCredentialData(encryptedPsk)

      credentialPda = getPskCredentialPda(
        program,
        subscriptionPda,
        planPda,
        authMethodPda,
        mock.customer.publicKey,
      )

      await registerCredentialRpc({
        program,
        caller: mock.customer.publicKey,
        signer: mock.customer,
        authMethodPda,
        planPda: planPda,
        subscriptionPda: subscriptionPda,
        credentialPda,
        credentialData: Array.from(serializedParams),
      })

      // Verify the credential was created correctly
      const credential = await program.account.credential.fetch(credentialPda)
      expect(credential.createdAt.toNumber()).toBeGreaterThan(0)
      expect(credential.authority.equals(mock.customer.publicKey)).toBeTruthy()
      expect(credential.authMethod.equals(authMethodPda)).toBeTruthy()
      expect(credential.plan.equals(planPda)).toBeTruthy()
      expect(credential.subscription.equals(subscriptionPda)).toBeTruthy()

      // Verify credential data structure
      const storedCredentialData = Buffer.from(credential.credentialData)
      expect(storedCredentialData.length).toBe(128) // Full credential data space

      console.log({
        credentialPda: credentialPda.toString(),
        credentialSize: credential.credentialData.length,
      })
    })

    test('revokes PSK credential successfully', async () => {
      // Verify credential exists before revocation
      const credentialBefore = await program.account.credential.fetch(
        credentialPda,
      )
      expect(credentialBefore).toBeTruthy()

      const planName = 'test PSK plan'
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

      const [subscriptionPda] = getSubscriptionPda(
        program,
        planPda,
        mock.customer.publicKey,
      )

      // Revoke the credential
      provider.wallet = new Wallet(mock.customer)
      await revokeCredentialRpc({
        program,
        caller: mock.customer.publicKey,
        signer: mock.customer,
        subscriptionPda: subscriptionPda,
        planPda: planPda,
        authMethodPda,
        credentialPda,
      })

      // Verify credential account is closed
      try {
        await program.account.credential.fetch(credentialPda)
        // Should not reach here if account is properly closed
        expect(false).toBe(true)
      } catch (error) {
        expect(error).toBeTruthy()
        console.log('Expected error for closed credential account')
      }
    })
  })
