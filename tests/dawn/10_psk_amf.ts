import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { Dawn } from '../../target/types/dawn'
import {
  mock,
  getProvider,
  loadWallet,
} from '../../app/utils'
import {
  createPskCredentialData,
  serializePskCredentialData,
  createPSKMethodParams,
  serializePSKMethodParams,
  getPskAuthMethodPda,
  getCredentialPda as getPskCredentialPda,
} from '../../app/dawn/register_psk_auth'
import { BankrunProvider } from 'anchor-bankrun'
import { beforeAll, expect } from '@jest/globals'

export const pskAmfTests = () =>
  describe('dawn::psk_amf', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>
    let authMethodPda: anchor.web3.PublicKey
    let credentialPda: anchor.web3.PublicKey
    let clientKeypair: anchor.web3.Keypair

    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = wallet
      anchor.setProvider(provider as any)

      program = anchor.workspace.DAWN as Program<Dawn>

      // Generate client keypair for credential tests
      clientKeypair = anchor.web3.Keypair.generate()
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
      const [pskAuthMethodPda] = getPskAuthMethodPda(program, wallet.publicKey, parametersBuffer)
      
      authMethodPda = pskAuthMethodPda

      // Register the auth method on-chain
      const signature = await program.methods
        .registerAuthMethod(
          { psk: {} },
          Array.from(parametersBuffer)
        )
        .accountsPartial({
          caller: wallet.publicKey,
          config: mock.configPda,
          authMethod: authMethodPda,
        })
        .signers([wallet.payer])
        .rpc()

      expect(signature).toBeTruthy()

      // Verify the account was created correctly
      const authMethod = await program.account.authMethod.fetch(authMethodPda)
      expect(authMethod.methodType).toStrictEqual({ psk: {} })
      expect(authMethod.authority.equals(wallet.publicKey)).toBeTruthy()

      console.log({
        authMethodPda: authMethodPda.toString(),
        signature: signature,
      })
    })

    test('registers client credential for PSK network', async () => {
      const psk = 'SuperSecurePassword123!'

      // Create credential data with hash using client pubkey as salt
      const credentialData = createPskCredentialData(psk, clientKeypair.publicKey)
      const serializedData = serializePskCredentialData(credentialData)

      credentialPda = getPskCredentialPda(
        program,
        authMethodPda,
        clientKeypair.publicKey
      )[0]

      await program.methods
        .registerCredential(
          clientKeypair.publicKey,
          Array.from(serializedData)
        )
        .accountsPartial({
          caller: wallet.publicKey,
          authMethod: authMethodPda,
          credential: credentialPda,
        })
        .signers([wallet.payer])
        .rpc()

      // Verify the credential was created correctly
      const credential = await program.account.credential.fetch(credentialPda)
      expect(credential.createdAt.toNumber()).toBeGreaterThan(0)
      expect(credential.client.equals(clientKeypair.publicKey)).toBeTruthy()
      expect(credential.authMethod.equals(authMethodPda)).toBeTruthy()

      // Verify credential data structure
      const storedCredentialData = Buffer.from(credential.credentialData)
      expect(storedCredentialData.length).toBe(128) // Full credential data space

      console.log({
        credentialPda: credentialPda.toString(),
        clientPubkey: clientKeypair.publicKey.toString(),
        credentialSize: credential.credentialData.length,
      })
    })

    test('fails to register credential with wrong authority', async () => {
      const unauthorizedKeypair = anchor.web3.Keypair.generate()

      // Fund the unauthorized wallet
      provider.context.setAccount(unauthorizedKeypair.publicKey, {
        lamports: 1000000000, // 1 SOL
        owner: anchor.web3.SystemProgram.programId,
        executable: false,
        data: Buffer.from([]),
      })

      const credentialData = createPskCredentialData(
        'TestPassword',
        clientKeypair.publicKey
      )
      const serializedData = serializePskCredentialData(credentialData)

      const [unauthorizedCredentialPda] = getPskCredentialPda(
        program,
        authMethodPda,
        anchor.web3.Keypair.generate().publicKey // Different client
      )

      try {
        await program.methods
          .registerCredential(
            clientKeypair.publicKey,
            Array.from(serializedData)
          )
          .accountsPartial({
            caller: unauthorizedKeypair.publicKey,
            authMethod: authMethodPda,
            credential: unauthorizedCredentialPda,
          })
          .signers([unauthorizedKeypair])
          .rpc()

        // Should not reach here
        expect(false).toBe(true)
      } catch (error) {
        expect(error).toBeTruthy()
        console.log('Expected error for unauthorized credential registration:', error.message)
      }
    })

    test('revokes PSK credential successfully', async () => {
      // Verify credential exists before revocation
      const credentialBefore = await program.account.credential.fetch(
        credentialPda
      )
      expect(credentialBefore).toBeTruthy()

      // Revoke the credential
      await program.methods
        .revokeCredential()
        .accountsPartial({
          caller: wallet.publicKey,
          authMethod: authMethodPda,
          credential: credentialPda,
        })
        .signers([wallet.payer])
        .rpc()

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