import { Program } from '@coral-xyz/anchor'
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js'

import { Dawn } from '../../../target/types/dawn'
import { mock } from '../../utils'
import { PSKNetworkConfig, PSKMethodParams } from '../../utils/types'
import {
  createPSKMethodParams,
  serializePskCredentialData,
  serializePSKMethodParams,
  // createPskCredentialData,
  // serializePskCredentialData,
  validatePSKMethodParams,
} from '../../utils/auth'
import { getPskAuthMethodPda, getCredentialPda } from '../../pda/amf'
import { getSubscriptionPda } from '../../pda/subscription'
import { encryptWithPublicKey } from '../../utils/encrypt'

export class AuthManager {
  constructor(private program: Program<Dawn>) {}

  /** Register PSK authentication method */
  async registerPskAuthMethod(
    configPda: PublicKey,
    authority: PublicKey,
    device: PublicKey,
    pskParams: PSKNetworkConfig,
    encryptionKey: Uint8Array,
  ): Promise<{ itx: TransactionInstruction; authMethodPda: PublicKey }> {
    const params = createPSKMethodParams(pskParams)
    validatePSKMethodParams(params)
    const parametersBuffer = serializePSKMethodParams(params)

    const [authMethodPda] = getPskAuthMethodPda(
      this.program,
      authority,
      device,
      encryptionKey,
      parametersBuffer,
    )

    console.log('device', device.toBase58())

    const itx = await this.program.methods
      .registerAuthMethod(
        { psk: {} },
        Array.from(encryptionKey),
        Array.from(parametersBuffer),
      )
      .accountsPartial({
        caller: authority,
        config: configPda,
        device: device,
        authMethod: authMethodPda,
      })
      .instruction()

    return { itx, authMethodPda }
  }

  /**
   * Register PSK credential for a client (with hash using client pubkey as salt)
   * Requires the caller to have an active subscription to the plan
   */
  async registerPskCredential(
    caller: PublicKey,
    planPda: PublicKey,
    authMethodPda: PublicKey,
    psk: string,
  ): Promise<{ itx: TransactionInstruction; credentialPda: PublicKey }> {
    const authMethod = await this.program.account.authMethod.fetch(
      authMethodPda,
    )
    const encryptionKey = authMethod.encryptionKey
    const encryptedPsk = encryptWithPublicKey(
      psk,
      new Uint8Array(encryptionKey),
    )
    const credentialData = serializePskCredentialData(encryptedPsk)

    const [subscriptionPda] = getSubscriptionPda(this.program, planPda, caller)

    const credentialPda = getCredentialPda(
      this.program,
      subscriptionPda,
      planPda,
      authMethodPda,
      caller,
    )

    const itx = await this.program.methods
      .registerCredential(Array.from(credentialData))
      .accountsPartial({
        caller: caller,
        authMethod: authMethodPda,
        plan: planPda,
        subscription: subscriptionPda,
        credential: credentialPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction()

    return { itx, credentialPda }
  }
}
