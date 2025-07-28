import { Program } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { Dawn } from '../../../target/types/dawn'
import { mock } from '../../utils'
import { PSKNetworkConfig, PSKMethodParams } from '../../utils/types'
import {
  createPSKMethodParams,
  serializePSKMethodParams,
  createPskCredentialData,
  serializePskCredentialData,
  validatePSKMethodParams,
} from '../../utils/auth'
import { getPskAuthMethodPda, getCredentialPda } from '../../pda/amf'

export class AuthManager {
  constructor(private program: Program<Dawn>) {}

  /**
   * Register PSK authentication method (only network parameters, no PSK)
   */
  async registerPskAuthMethod(
    authority: PublicKey,
    plan: PublicKey,
    config: PSKNetworkConfig,
  ): Promise<{ signature: string; authMethodPda: PublicKey }> {
    const params = createPSKMethodParams(config)
    validatePSKMethodParams(params)

    const parametersBuffer = serializePSKMethodParams(params)
    const [authMethodPda] = getPskAuthMethodPda(
      this.program,
      authority,
      parametersBuffer,
    )

    const signature = await this.program.methods
      .registerAuthMethod({ psk: {} }, Array.from(parametersBuffer))
      .accountsPartial({
        caller: authority,
        config: mock.configPda,
        authMethod: authMethodPda,
      })
      .rpc()

    return { signature, authMethodPda }
  }

  /**
   * Register PSK credential for a client (with hash using client pubkey as salt)
   */
  async registerPskCredential(
    authority: PublicKey,
    authMethodPda: PublicKey,
    clientPubkey: PublicKey,
    psk: string,
    metadata?: Buffer,
  ): Promise<{ signature: string; credentialPda: PublicKey }> {
    const credentialData = createPskCredentialData(psk, clientPubkey)
    const serializedData = serializePskCredentialData(credentialData)

    const credentialPda = getCredentialPda(
      this.program,
      authMethodPda,
      clientPubkey,
    )

    const signature = await this.program.methods
      .registerCredential(clientPubkey, Array.from(serializedData))
      .accountsPartial({
        caller: authority,
        authMethod: authMethodPda,
        credential: credentialPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc()

    return { signature, credentialPda }
  }

  /**
   * Register both PSK auth method and credential in a single flow
   */
  async registerPskAuth(
    authority: PublicKey,
    plan: PublicKey,
    clientPubkey: PublicKey,
    psk: string,
    config: PSKNetworkConfig,
  ): Promise<{
    authMethodSignature: string
    credentialSignature: string
    authMethodPda: PublicKey
    credentialPda: PublicKey
  }> {
    // Register auth method
    const { signature: authMethodSignature, authMethodPda } =
      await this.registerPskAuthMethod(authority, plan, config)

    // Register credential
    const { signature: credentialSignature, credentialPda } =
      await this.registerPskCredential(
        authority,
        authMethodPda,
        clientPubkey,
        psk,
      )

    return {
      authMethodSignature,
      credentialSignature,
      authMethodPda,
      credentialPda,
    }
  }
}
