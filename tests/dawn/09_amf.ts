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
  loadWallet,
  EAPType,
  CipherSuite,
  EAPParams,
  serializeEAPParams,
  DEFAULT_EAP_PARAMS,
  validateEAPParams,
  fetchEAPParams
} from '../../app/utils'
import { BankrunProvider } from 'anchor-bankrun'
import { beforeAll, expect } from '@jest/globals'

export const amfTests = () =>
  describe('dawn::amf', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>
    let authMethodPda: anchor.web3.PublicKey

    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = wallet
      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)
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
      };
      
      // Validate parameters
      try {
        validateEAPParams(eapParams);
        console.log("EAP parameters validated successfully");
      } catch (error) {
        console.error("Invalid EAP parameters:", error);
        throw error;
      }
      
      // Serialize parameters to buffer
      const paramsBuffer = serializeEAPParams(eapParams);
      
      // Convert to array for the API
      const paramsArray = Array.from(paramsBuffer);
      
      console.log({
        eapType: EAPType[eapParams.eapType],
        cipherSuite: CipherSuite[eapParams.cipherSuite],
        maxFragmentSize: eapParams.maxFragmentSize,
        sessionTimeout: eapParams.sessionTimeout,
        bufferLength: paramsBuffer.length
      });

      authMethodPda = getAuthMethodPda(program, authMethodType)

      // This cast is needed to ensure compatibility with the exact type expected by Anchor
      const tx = await program.methods
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
      expect(authMethod.isActive).toBeTruthy()
      
      // Store the original parameters for later comparison
      return eapParams;
    })
    
    test('retrieves and deserializes 802.1x (eap) auth method parameters', async () => {
      // Fetch the original parameters for comparison (from previous test)
      const originalParams = await fetchEAPParams(program, authMethodPda);
      
      // Ensure parameters were retrieved and deserialized correctly
      expect(originalParams).not.toBeNull();
      if (originalParams) {
        // Verify key parameters match what we set
        expect(originalParams.eapType).toBe(DEFAULT_EAP_PARAMS.eapType);
        expect(originalParams.cipherSuite).toBe(DEFAULT_EAP_PARAMS.cipherSuite);
        expect(originalParams.maxFragmentSize).toBe(DEFAULT_EAP_PARAMS.maxFragmentSize);
        expect(originalParams.sessionTimeout).toBe(DEFAULT_EAP_PARAMS.sessionTimeout);
        expect(originalParams.identityPrivacy).toBe(DEFAULT_EAP_PARAMS.identityPrivacy);
        expect(originalParams.validateServerCert).toBe(DEFAULT_EAP_PARAMS.validateServerCert);
        
        // Log the deserialized parameters for verification
        console.log({
          deserializedParams: {
            eapType: EAPType[originalParams.eapType],
            cipherSuite: CipherSuite[originalParams.cipherSuite],
            maxFragmentSize: originalParams.maxFragmentSize,
            sessionTimeout: originalParams.sessionTimeout
          }
        });
      }
    })
  })
