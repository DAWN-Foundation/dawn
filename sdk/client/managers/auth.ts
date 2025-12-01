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
import { getSubscriptionPda } from '../../pda/subscription'

export class AuthManager {
  constructor(private program: Program<Dawn>) {}

  /**
   * Register PSK authentication method (only network parameters, no PSK)
   */
  async registerPskAuthMethod(
    authority: PublicKey,
    plan: PublicKey,
    device: PublicKey,
    config: PSKNetworkConfig,
    encryptionKey: PublicKey,
  ): Promise<{ signature: string; authMethodPda: PublicKey }> {
    const params = createPSKMethodParams(config)
    validatePSKMethodParams(params)

    const parametersBuffer = serializePSKMethodParams(params)
    const [authMethodPda] = getPskAuthMethodPda(
      this.program,
      authority,
      device,
      parametersBuffer,
    )

    const signature = await this.program.methods
      .registerAuthMethod(
        { psk: {} },
        encryptionKey,
        Array.from(parametersBuffer),
      )
      .accountsPartial({
        caller: authority,
        config: mock.configPda,
        authMethod: authMethodPda,
        device: device,
      })
      .rpc()

    return { signature, authMethodPda }
  }

  /**
   * Register PSK credential for a client (with hash using client pubkey as salt)
   * Requires the caller to have an active subscription to the plan
   */
  async registerPskCredential(
    caller: PublicKey,
    plan: PublicKey,
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

    const [subscriptionPda] = getSubscriptionPda(this.program, plan, caller)

    const signature = await this.program.methods
      .registerCredential(clientPubkey, Array.from(serializedData))
      .accountsPartial({
        caller: caller,
        authMethod: authMethodPda,
        plan: plan,
        subscription: subscriptionPda,
        credential: credentialPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc()

    return { signature, credentialPda }
  }

  /**
   * Register both PSK auth method and credential in a single flow
   * Note: This requires the caller to have an active subscription to the plan
   */
  async registerPskAuth(
    authority: PublicKey,
    plan: PublicKey,
    device: PublicKey,
    clientPubkey: PublicKey,
    psk: string,
    config: PSKNetworkConfig,
    encryptionKey: PublicKey,
    credentialCaller?: PublicKey, // Optional: if different from authority (e.g., customer with subscription)
  ): Promise<{
    authMethodSignature: string
    credentialSignature: string
    authMethodPda: PublicKey
    credentialPda: PublicKey
  }> {
    // Register auth method
    const { signature: authMethodSignature, authMethodPda } =
      await this.registerPskAuthMethod(
        authority,
        plan,
        device,
        config,
        encryptionKey,
      )

    // Register credential (use credentialCaller if provided, otherwise use authority)
    const caller = credentialCaller || authority
    const { signature: credentialSignature, credentialPda } =
      await this.registerPskCredential(
        caller,
        plan,
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
