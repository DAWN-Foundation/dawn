import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { Dawn } from '../../target/types/dawn'
import {
  mock,
  getProvider,
  PROGRAM_ID,
  AuthMethodType,
  getAuthMethodPda,
  getCredentialPda,
  getConnectionPda,
  loadWallet,
  EAPType,
  CipherSuite,
  EAPParams,
  serializeEAPParams,
  DEFAULT_EAP_PARAMS,
  validateEAPParams,
  fetchEAPParams,
  generateEAPTLSCredential,
  serializeEAPTLSCredential,
  IPsecAlgorithm,
  IPsecMode,
  IPsecAHParams,
  DEFAULT_IPSEC_AH_PARAMS,
  serializeIPsecAHParams,
  validateIPsecAHParams,
  generateIPsecAHCredential,
  serializeIPsecAHCredential,
  deserializeIPsecAHCredential,
} from '../../sdk/utils'
import { BankrunProvider } from 'anchor-bankrun'
import { beforeAll, expect } from '@jest/globals'

export const amfTests = () =>
  describe('dawn::amf', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>
    let authMethodPda: anchor.web3.PublicKey
    let clientKeypair: anchor.web3.Keypair
    let credentialPda: anchor.web3.PublicKey
    let ipsecAuthMethodPda: anchor.web3.PublicKey
    let connectionPda: anchor.web3.PublicKey
    let entityAKeypair: anchor.web3.Keypair
    let entityBKeypair: anchor.web3.Keypair

    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = wallet
      anchor.setProvider(provider as any)

      program = anchor.workspace.DAWN as Program<Dawn>

      // Generate client keypair for credential tests
      clientKeypair = anchor.web3.Keypair.generate()

      // Generate entity keypairs for IPsec connection tests
      entityAKeypair = anchor.web3.Keypair.generate()
      entityBKeypair = anchor.web3.Keypair.generate()
    })

    test('mock setup', () => {
      assert.exists(mock)
    })

    test('registers 802.1x (eap) auth method', async () => {
      const authMethodType: AuthMethodType = { eap: {} }

      // Create EAP parameters with appropriate values
      const eapParams: EAPParams = {
        ...DEFAULT_EAP_PARAMS,
        certificateAuthority: anchor.web3.Keypair.generate().publicKey,
        radiusServer: anchor.web3.Keypair.generate().publicKey,
      }

      // Validate parameters
      try {
        validateEAPParams(eapParams)
        console.log('EAP parameters validated successfully')
      } catch (error) {
        console.error('Invalid EAP parameters:', error)
        throw error
      }

      // Serialize parameters to buffer
      const paramsBuffer = serializeEAPParams(eapParams)

      // Convert to array for the API
      const paramsArray = Array.from(paramsBuffer)

      console.log({
        eapType: EAPType[eapParams.eapType],
        cipherSuite: CipherSuite[eapParams.cipherSuite],
        maxFragmentSize: eapParams.maxFragmentSize,
        sessionTimeout: eapParams.sessionTimeout,
        bufferLength: paramsBuffer.length,
      })

      authMethodPda = getAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        authMethodType,
        paramsBuffer,
      )

      // This cast is needed to ensure compatibility with the exact type expected by Anchor
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

      // make sure the account was created
      const authMethod = await program.account.authMethod.fetch(authMethodPda)
      expect(authMethod.methodType).toStrictEqual(authMethodType)
      expect(authMethod.parameters).toStrictEqual(paramsArray)

      // Store the original parameters for later comparison
      return eapParams
    })

    test('retrieves and deserializes 802.1x (eap) auth method parameters', async () => {
      // Fetch the original parameters for comparison (from previous test)
      const originalParams = await fetchEAPParams(program, authMethodPda)

      // Ensure parameters were retrieved and deserialized correctly
      expect(originalParams).not.toBeNull()
      if (originalParams) {
        // Verify key parameters match what we set
        expect(originalParams.eapType).toBe(DEFAULT_EAP_PARAMS.eapType)
        expect(originalParams.cipherSuite).toBe(DEFAULT_EAP_PARAMS.cipherSuite)
        expect(originalParams.maxFragmentSize).toBe(
          DEFAULT_EAP_PARAMS.maxFragmentSize,
        )
        expect(originalParams.sessionTimeout).toBe(
          DEFAULT_EAP_PARAMS.sessionTimeout,
        )
        expect(originalParams.identityPrivacy).toBe(
          DEFAULT_EAP_PARAMS.identityPrivacy,
        )
        expect(originalParams.validateServerCert).toBe(
          DEFAULT_EAP_PARAMS.validateServerCert,
        )

        // Log the deserialized parameters for verification
        console.log({
          deserializedParams: {
            eapType: EAPType[originalParams.eapType],
            cipherSuite: CipherSuite[originalParams.cipherSuite],
            maxFragmentSize: originalParams.maxFragmentSize,
            sessionTimeout: originalParams.sessionTimeout,
          },
        })
      }
    })

    test('fails to register client credential with wrong authority', async () => {
      const unauthorizedKeypair = anchor.web3.Keypair.generate()

      // Fund the unauthorized wallet so it can pay for transaction fees
      provider.context.setAccount(unauthorizedKeypair.publicKey, {
        lamports: 1000000000, // 1 SOL
        owner: anchor.web3.SystemProgram.programId,
        executable: false,
        data: Buffer.from([]),
      })

      // Create a proper EAP-TLS credential
      const eapTLSCredential = generateEAPTLSCredential(
        'client@example.com',
        '/path/to/client-cert.pem',
        '/path/to/private-key.pem',
      )

      // Validate and serialize the credential to a 128-byte buffer
      const serializedCredential = serializeEAPTLSCredential(eapTLSCredential)

      // Convert buffer to array for the API
      const credentialData = Array.from(serializedCredential)

      try {
        await program.methods
          .registerCredential(clientKeypair.publicKey, credentialData)
          .accountsPartial({
            caller: unauthorizedKeypair.publicKey,
            authMethod: authMethodPda,
            credential: credentialPda,
          })
          .signers([unauthorizedKeypair])
          .rpc()

        // Should not reach here
        expect(false).toBe(true)
      } catch (error) {
        expect(error).toBeTruthy()
        console.log(error)
        // Could check for specific error code if available
      }
    })

    test('registers client credential successfully', async () => {
      // Use EAP auth method type - this needs to be converted to a number for the instruction
      const methodType: AuthMethodType = { eap: {} }

      // Create a proper EAP-TLS credential
      const eapTLSCredential = generateEAPTLSCredential(
        'client@example.com',
        '/path/to/client-cert.pem',
        '/path/to/private-key.pem',
      )

      // Validate and serialize the credential to a 128-byte buffer
      const serializedCredential = serializeEAPTLSCredential(eapTLSCredential)

      // Convert buffer to array for the API
      const credentialData = Array.from(serializedCredential)

      credentialPda = getCredentialPda(
        program,
        authMethodPda,
        clientKeypair.publicKey,
      )

      const tx = await program.methods
        .registerCredential(clientKeypair.publicKey, credentialData)
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          authMethod: authMethodPda,
          credential: credentialPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Fetch and verify the credential was created correctly
      const credential = await program.account.credential.fetch(credentialPda)
      expect(credential.createdAt.toNumber()).toBeGreaterThan(0)
      expect(credential.client.equals(clientKeypair.publicKey)).toBeTruthy()
      expect(credential.authMethod.equals(authMethodPda)).toBeTruthy()
      expect(credential.credentialData).toStrictEqual(credentialData)
    })

    test('fails to revoke credential with wrong authority', async () => {
      // Create a different keypair to attempt unauthorized revocation
      const unauthorizedKeypair = anchor.web3.Keypair.generate()

      // Fund the unauthorized wallet so it can pay for transaction fees
      provider.context.setAccount(unauthorizedKeypair.publicKey, {
        lamports: 1000000000, // 1 SOL
        owner: anchor.web3.SystemProgram.programId,
        executable: false,
        data: Buffer.from([]),
      })

      try {
        await program.methods
          .revokeCredential()
          .accountsPartial({
            caller: unauthorizedKeypair.publicKey,
            authMethod: authMethodPda,
            credential: credentialPda,
          })
          .signers([unauthorizedKeypair])
          .rpc()

        // Should not reach here
        expect(false).toBe(true)
      } catch (error) {
        expect(error).toBeTruthy()
        // Could check for specific error code if available
      }
    })

    test('revokes client credential successfully', async () => {
      // Verify credential exists before revocation
      const credentialBefore = await program.account.credential.fetch(
        credentialPda,
      )
      expect(credentialBefore).toBeTruthy()

      // Revoke the credential
      await program.methods
        .revokeCredential()
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          authMethod: authMethodPda,
          credential: credentialPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Verify credential account is closed (should throw error when trying to fetch)
      try {
        await program.account.credential.fetch(credentialPda)
        // Should not reach here if account is properly closed
        expect(false).toBe(true)
      } catch (error) {
        expect(error).toBeTruthy()
        console.log(error)
      }
    })

    // IPsec Authentication Header Tests
    test('registers IPsec AH auth method', async () => {
      const authMethodType: AuthMethodType = { ipsecAh: {} }

      // Create IPsec AH parameters with appropriate values
      const ipsecParams: IPsecAHParams = {
        ...DEFAULT_IPSEC_AH_PARAMS,
        // Override default SPI to ensure consistent testing
        spi: 0x12345678,
      }

      // Validate parameters
      try {
        validateIPsecAHParams(ipsecParams)
        console.log('IPsec AH parameters validated successfully')
      } catch (error) {
        console.error('Invalid IPsec AH parameters:', error)
        throw error
      }

      // Serialize parameters to buffer
      const paramsBuffer = serializeIPsecAHParams(ipsecParams)

      // Convert to array for the API
      const paramsArray = Array.from(paramsBuffer)

      console.log({
        algorithm: IPsecAlgorithm[ipsecParams.algorithm],
        mode: IPsecMode[ipsecParams.mode],
        spi: `0x${ipsecParams.spi.toString(16).padStart(8, '0')}`,
        keyLifetime: ipsecParams.keyLifetime,
        bufferLength: paramsBuffer.length,
      })

      ipsecAuthMethodPda = getAuthMethodPda(
        program,
        mock.serviceProvider.publicKey,
        authMethodType,
        paramsBuffer,
      )

      // This cast is needed to ensure compatibility with the exact type expected by Anchor
      await program.methods
        .registerAuthMethod(authMethodType as any, paramsArray)
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          config: mock.configPda,
          authMethod: ipsecAuthMethodPda,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // make sure the account was created
      const authMethod = await program.account.authMethod.fetch(
        ipsecAuthMethodPda,
      )
      expect(authMethod.methodType).toStrictEqual(authMethodType)
      expect(authMethod.parameters).toStrictEqual(paramsArray)

      return ipsecParams
    })

    test('registers IPsec AH connection successfully', async () => {
      // Create credentials for both entities
      const entityACredential = generateIPsecAHCredential(
        'vpn-client-1',
        'psk-hash-1',
      )

      const entityBCredential = generateIPsecAHCredential(
        'vpn-server-1',
        'psk-hash-2',
      )

      // Serialize credentials
      const serializedEntityACredential =
        serializeIPsecAHCredential(entityACredential)
      const serializedEntityBCredential =
        serializeIPsecAHCredential(entityBCredential)

      // Convert to arrays for the API
      const credentialDataA = Array.from(serializedEntityACredential)
      const credentialDataB = Array.from(serializedEntityBCredential)

      connectionPda = getConnectionPda(
        program,
        ipsecAuthMethodPda,
        entityAKeypair.publicKey,
        entityBKeypair.publicKey,
      )

      await program.methods
        .registerConnection(
          entityAKeypair.publicKey,
          entityBKeypair.publicKey,
          credentialDataA,
          credentialDataB,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          authMethod: ipsecAuthMethodPda,
          connection: connectionPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Fetch and verify the connection was created correctly
      const connection = await program.account.connection.fetch(connectionPda)
      expect(connection.createdAt.toNumber()).toBeGreaterThan(0)
      expect(connection.entityA.equals(entityAKeypair.publicKey)).toBeTruthy()
      expect(connection.entityB.equals(entityBKeypair.publicKey)).toBeTruthy()
      expect(connection.authMethod.equals(ipsecAuthMethodPda)).toBeTruthy()
      expect(connection.credentialDataA).toStrictEqual(credentialDataA)
      expect(connection.credentialDataB).toStrictEqual(credentialDataB)

      // Test credential deserialization
      const deserializedEntityACredential = deserializeIPsecAHCredential(
        Buffer.from(connection.credentialDataA),
      )
      const deserializedEntityBCredential = deserializeIPsecAHCredential(
        Buffer.from(connection.credentialDataB),
      )

      // Verify deserialized credentials match original
      expect(deserializedEntityACredential.keyId).toBe(entityACredential.keyId)
      expect(deserializedEntityACredential.pskRef).toBe(
        entityACredential.pskRef,
      )
      expect(deserializedEntityACredential.preferredAlgorithm).toBe(
        entityACredential.preferredAlgorithm,
      )
      expect(deserializedEntityACredential.preferredWindowSize).toBe(
        entityACredential.preferredWindowSize,
      )
      expect(deserializedEntityACredential.useExtendedSequence).toBe(
        entityACredential.useExtendedSequence,
      )

      expect(deserializedEntityBCredential.keyId).toBe(entityBCredential.keyId)
      expect(deserializedEntityBCredential.pskRef).toBe(
        entityBCredential.pskRef,
      )
      expect(deserializedEntityBCredential.preferredAlgorithm).toBe(
        entityBCredential.preferredAlgorithm,
      )
      expect(deserializedEntityBCredential.preferredWindowSize).toBe(
        entityBCredential.preferredWindowSize,
      )
      expect(deserializedEntityBCredential.useExtendedSequence).toBe(
        entityBCredential.useExtendedSequence,
      )
    })

    test('revokes connection successfully', async () => {
      // Verify connection exists before revocation
      const connectionBefore = await program.account.connection.fetch(
        connectionPda,
      )
      expect(connectionBefore).toBeTruthy()

      // Revoke the connection
      await program.methods
        .revokeConnection()
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          authMethod: ipsecAuthMethodPda,
          connection: connectionPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // Verify connection account is closed (should throw error when trying to fetch)
      try {
        await program.account.connection.fetch(connectionPda)
        // Should not reach here if account is properly closed
        expect(false).toBe(true)
      } catch (error) {
        expect(error).toBeTruthy()
      }
    })
  })
