/**
 * Discriminator-based dispatch.
 *
 * Given the raw bytes of an account, identify which dawn account type it
 * is by matching the first 8 bytes against ACCOUNT_DISC, then run the
 * appropriate decoder. Returns null if no discriminator matches (e.g.
 * SPL token accounts, mints, or any non-dawn account).
 */

import { ACCOUNT_DISC } from './discriminators'
import {
  decodeAccessDomain,
  decodeAccessDomainAuthenticator,
  decodeAuthMethod,
  decodeConfig,
  decodeCredential,
  decodeDevice,
  decodeDeviceLocation,
  decodeDeviceModel,
  decodeDomainAuthority,
  decodeLocalDomain,
} from './decoders'

export type DecodedAccount = {
  type: string
  decoded: unknown
}

const REGISTRY: Record<string, (b: Buffer) => unknown> = {
  Config: decodeConfig,
  DeviceModel: decodeDeviceModel,
  Device: decodeDevice,
  DeviceLocation: decodeDeviceLocation,
  LocalDomain: decodeLocalDomain,
  AccessDomain: decodeAccessDomain,
  AccessDomainAuthenticator: decodeAccessDomainAuthenticator,
  DomainAuthority: decodeDomainAuthority,
  AuthMethod: decodeAuthMethod,
  Credential: decodeCredential,
}

/**
 * Match the first 8 bytes against every known account discriminator.
 * Returns the matching type name or null.
 */
export function identifyAccount(buf: Buffer): string | null {
  if (buf.length < 8) return null
  const head = buf.subarray(0, 8)
  for (const [name, disc] of Object.entries(ACCOUNT_DISC)) {
    if (head.equals(disc)) return name
  }
  return null
}

/**
 * Identify and decode in one step. Returns null for non-dawn accounts.
 * Decoder failures (incomplete bytes etc.) bubble up as throws by design —
 * we want loud failures rather than silent corruption.
 */
export function decodeAccount(buf: Buffer): DecodedAccount | null {
  const type = identifyAccount(buf)
  if (!type) return null
  const fn = REGISTRY[type]
  if (!fn) return null
  return { type, decoded: fn(buf) }
}
