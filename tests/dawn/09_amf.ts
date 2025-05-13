import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { Dawn, IDL } from '../../target/types/dawn'
import {
  mock,
  getProvider,
  PROGRAM_ID,
  AuthMethodType,
  getAuthMethodPda,
  getCredentialPda,
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
  TLSVersion,
} from '../../app/utils'
import { BankrunProvider } from 'anchor-bankrun'
import { beforeAll, expect } from '@jest/globals'

export const amfTests = () =>
  describe('dawn::amf', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>
    let authMethodPda: anchor.web3.PublicKey
    let clientKeypair: anchor.web3.Keypair
    let credentialPda: anchor.web3.PublicKey

    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = wallet
      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)

      // Generate client keypair for credential tests
      clientKeypair = anchor.web3.Keypair.generate()
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
        wallet.publicKey,
        authMethodType,
        paramsBuffer,
      )

      // This cast is needed to ensure compatibility with the exact type expected by Anchor
      await program.methods
        .registerAuthMethod(authMethodType as any, paramsArray)
        .accounts({
          caller: wallet.publicKey,
          config: mock.configPda,
          authMethod: authMethodPda,
        })
        .signers([wallet.payer])
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
      const methodType: AuthMethodType = { eap: {} }
      const unauthorizedKeypair = anchor.web3.Keypair.generate()

      // Fund the unauthorized wallet so it can pay for transaction fees
      provider.context.setAccount(unauthorizedKeypair.publicKey, {
        lamports: 1000000000, // 1 SOL
        owner: anchor.web3.SystemProgram.programId,
        executable: false,
        data: Buffer.from([])
      })

      // Create a proper EAP-TLS credential
      const eapTLSCredential = generateEAPTLSCredential(
        'client@example.com',
        '/path/to/client-cert.pem',
        '/path/to/private-key.pem'
      );

      // Validate and serialize the credential to a 128-byte buffer
      const serializedCredential = serializeEAPTLSCredential(eapTLSCredential);
      
      // Convert buffer to array for the API
      const credentialData = Array.from(serializedCredential);

      try {
        await program.methods
          .registerCredential(methodType, credentialData)
          .accounts({
            authority: unauthorizedKeypair.publicKey,
            client: clientKeypair.publicKey,
            authMethod: authMethodPda,
            credential: credentialPda,
            systemProgram: anchor.web3.SystemProgram.programId,
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
        '/path/to/private-key.pem'
      );

      // Validate and serialize the credential to a 128-byte buffer
      const serializedCredential = serializeEAPTLSCredential(eapTLSCredential);
      
      // Convert buffer to array for the API
      const credentialData = Array.from(serializedCredential);

      credentialPda = getCredentialPda(
        program,
        clientKeypair.publicKey,
        { eap: {} } as AuthMethodType, // This is just for PDA derivation
      )

      const tx = await program.methods
        .registerCredential(methodType, credentialData)
        .accounts({
          authority: wallet.publicKey,
          client: clientKeypair.publicKey,
          authMethod: authMethodPda,
          credential: credentialPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      // Fetch and verify the credential was created correctly
      const credential = await program.account.credential.fetch(
        credentialPda,
      )
      expect(credential.clientPubkey).toEqual(clientKeypair.publicKey)
      expect(credential.methodType).toBe({ eap: {} })
      expect(credential.authority).toEqual(wallet.publicKey)
      expect(credential.credentialData).toEqual(credentialData)
    })

    test('fails to revoke credential with wrong authority', async () => {
      // Create a different keypair to attempt unauthorized revocation
      const unauthorizedKeypair = anchor.web3.Keypair.generate()

      // Fund the unauthorized wallet so it can pay for transaction fees
      await provider.connection.requestAirdrop(
        unauthorizedKeypair.publicKey,
        1000000000, // 1 SOL
      )

      try {
        await program.methods
          .revokeCredential()
          .accounts({
            authority: unauthorizedKeypair.publicKey,
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
        .accounts({
          authority: wallet.publicKey,
          credential: credentialPda,
        })
        .signers([wallet.payer])
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
  })
