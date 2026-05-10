import { Program } from '@coral-xyz/anchor'
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js'

import { Dawn } from '../../../target/types/dawn'
import { PSKNetworkConfig } from '../../utils/types'
import {
  createPSKMethodParams,
  serializePSKMethodParams,
  validatePSKMethodParams,
} from '../../utils/auth'
import { getPskAuthMethodPda, getCredentialPda } from '../../pda/amf'
import { getSubscriptionPda } from '../../pda/subscription'

/**
 * High-level auth helpers post-access-domain redesign.
 *
 * Schema migration notes:
 *   - AuthMethod is keyed on (access_domain, method_type), not on a
 *     device + encryption_key tuple. The caller of registerPskAuthMethod
 *     must equal access_domain.owner.
 *   - Credentials carry a 128-byte sealed_payload. The plaintext is a
 *     framed PSK encrypted via libsodium sealed-box to
 *     `access_domain.control_plane_device.owner`. The sealing logic
 *     is implemented in `sim/codec/sealing.ts` on the lean branch and
 *     should be ported here when the operator-api side is rewired.
 *     For now, callers pass a pre-sealed 128-byte payload directly.
 */
export class AuthManager {
  constructor(private program: Program<Dawn>) {}

  /** Register a PSK auth method on an existing AccessDomain. */
  async registerPskAuthMethod(
    accessDomainPda: PublicKey,
    accessDomainOwner: PublicKey,
    pskParams: PSKNetworkConfig,
  ): Promise<{ itx: TransactionInstruction; authMethodPda: PublicKey }> {
    const params = createPSKMethodParams(pskParams)
    validatePSKMethodParams(params)
    const parametersBuffer = serializePSKMethodParams(params)

    const [authMethodPda] = getPskAuthMethodPda(this.program, accessDomainPda)

    const itx = await this.program.methods
      .registerAuthMethod({ psk: {} }, Array.from(parametersBuffer))
      .accountsPartial({
        caller: accessDomainOwner,
        accessDomain: accessDomainPda,
        authMethod: authMethodPda,
      })
      .instruction()

    return { itx, authMethodPda }
  }

  /**
   * Register a PSK credential for a customer on the plan-attached path.
   *
   * `sealedPayload` MUST be exactly 128 bytes — a libsodium sealed-box
   * envelope to `access_domain.control_plane_device.owner`. See
   * `docs/sot-bridge-protocol.md` §6 for the wire format and
   * `sim/codec/sealing.ts` for a reference implementation.
   */
  async registerPskCredential(
    caller: PublicKey,
    accessDomainPda: PublicKey,
    planPda: PublicKey,
    authMethodPda: PublicKey,
    sealedPayload: Uint8Array,
    options: {
      vlanId?: number | null
      qosTag?: number | null
    } = {},
  ): Promise<{ itx: TransactionInstruction; credentialPda: PublicKey }> {
    if (sealedPayload.length !== 128) {
      throw new Error(
        `sealedPayload must be 128 bytes (libsodium sealed-box envelope); got ${sealedPayload.length}`,
      )
    }

    const [subscriptionPda] = getSubscriptionPda(this.program, planPda, caller)

    const credentialPda = getCredentialPda(
      this.program,
      accessDomainPda,
      authMethodPda,
      caller,
    )

    const itx = await this.program.methods
      .registerCredential(
        options.vlanId ?? null,
        options.qosTag ?? null,
        Array.from(sealedPayload),
      )
      .accountsPartial({
        caller,
        accessDomain: accessDomainPda,
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
