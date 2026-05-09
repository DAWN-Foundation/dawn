/**
 * Off-chain sealing helpers for Credential.sealed_payload.
 *
 * Recipients are identified by their Solana public key (Ed25519). The
 * sealing layer transparently converts that to an X25519 (Montgomery)
 * public key for libsodium-style sealed-box encryption. Conversion uses
 * the standard `crypto_sign_ed25519_pk_to_curve25519` formula, available
 * here via @noble/curves's `edwardsToMontgomeryPub` /
 * `edwardsToMontgomeryPriv` helpers.
 *
 * Practically: the AAA service (= owner of `access_domain.control_plane_device`'s
 * Device PDA) holds a regular Solana keypair. To decrypt a Credential it
 * passes that Ed25519 secret to `openAsRecipient` which does the
 * conversion and the sealed-box decryption in one step.
 *
 * Wire layout for the 128-byte `sealed_payload` buffer:
 *   bytes  0..32   ephemeral X25519 public key (sealed-box prefix)
 *   bytes 32..N    ciphertext || Poly1305 tag (libsodium crypto_box_seal output)
 *   bytes N..128   zero pad
 *
 * libsodium's sealed-box overhead is 48 bytes, so plaintext can be up
 * to 80 bytes.
 */

import {
  edwardsToMontgomeryPriv,
  edwardsToMontgomeryPub,
} from '@noble/curves/ed25519'
import nacl from 'tweetnacl'
import sealedbox from 'tweetnacl-sealedbox-js'

import { PublicKey } from '@solana/web3.js'

const SEALED_PAYLOAD_LEN = 128
const ED25519_PK_LEN = 32
const ED25519_SK_LEN_FULL = 64 // tweetnacl/Solana convention: seed(32) || pubkey(32)
const ED25519_SK_LEN_SEED = 32 // raw seed only
const SEAL_OVERHEAD = 48 // 32 (ephemeral X25519 pubkey) + 16 (Poly1305 tag)
const FIXED_PLAINTEXT_LEN = SEALED_PAYLOAD_LEN - SEAL_OVERHEAD // 80 bytes

/**
 * Convert a Solana Ed25519 public key (32 bytes) to its Curve25519
 * (Montgomery) form for sealed-box recipient use.
 */
function ed25519PubToX25519(ed25519Pub: Uint8Array): Uint8Array {
  if (ed25519Pub.length !== ED25519_PK_LEN) {
    throw new Error(`Ed25519 pubkey must be ${ED25519_PK_LEN} bytes`)
  }
  return edwardsToMontgomeryPub(ed25519Pub)
}

/**
 * Convert an Ed25519 secret seed (32 bytes) to its X25519 secret key
 * (32 bytes, with the standard Curve25519 clamping applied by the noble
 * helper).
 */
function ed25519SeedToX25519(ed25519Seed: Uint8Array): Uint8Array {
  if (ed25519Seed.length !== ED25519_SK_LEN_SEED) {
    throw new Error(`Ed25519 seed must be ${ED25519_SK_LEN_SEED} bytes`)
  }
  return edwardsToMontgomeryPriv(ed25519Seed)
}

/**
 * Accept either a 64-byte Solana keypair secret (seed||pubkey) or a
 * raw 32-byte seed and return the seed.
 */
function asSeed(secret: Uint8Array | Buffer): Uint8Array {
  if (secret.length === ED25519_SK_LEN_SEED) return secret
  if (secret.length === ED25519_SK_LEN_FULL) return secret.slice(0, ED25519_SK_LEN_SEED)
  throw new Error(
    `Ed25519 secret must be ${ED25519_SK_LEN_SEED} or ${ED25519_SK_LEN_FULL} bytes (got ${secret.length})`,
  )
}

/**
 * Seal a fixed-size plaintext to a recipient identified by their Solana
 * public key. Plaintext MUST be exactly 80 bytes (the maximum that fits
 * in our 128-byte envelope budget after the 48-byte sealed-box overhead).
 *
 * Use `framePsk()` to produce a properly-padded 80-byte plaintext from a
 * variable-length PSK; the framing's length byte tells the recipient
 * where the real data ends after decryption.
 *
 * Returns exactly 128 bytes — the full sealed-box envelope, no padding
 * needed.
 *
 * Anyone can produce this; only the holder of the recipient's matching
 * Solana secret can open it. Fixed-size plaintext has the security
 * benefit of not leaking PSK length via ciphertext length.
 */
export function sealForRecipient(
  recipientSolanaPubkey: PublicKey | Buffer | Uint8Array,
  plaintext: Buffer,
): Buffer {
  if (plaintext.length !== FIXED_PLAINTEXT_LEN) {
    throw new Error(
      `plaintext must be exactly ${FIXED_PLAINTEXT_LEN} bytes (got ${plaintext.length}); use framePsk() to produce a fixed-size plaintext`,
    )
  }
  const pkBytes =
    recipientSolanaPubkey instanceof PublicKey
      ? recipientSolanaPubkey.toBytes()
      : recipientSolanaPubkey instanceof Uint8Array
        ? recipientSolanaPubkey
        : new Uint8Array(recipientSolanaPubkey)
  const x25519Pub = ed25519PubToX25519(pkBytes)
  const sealed = sealedbox.seal(new Uint8Array(plaintext), x25519Pub)
  // sealed.length === SEAL_OVERHEAD + FIXED_PLAINTEXT_LEN === SEALED_PAYLOAD_LEN
  return Buffer.from(sealed)
}

/**
 * Open a 128-byte sealed payload using the recipient's Ed25519 secret
 * key (the standard Solana keypair secret format — either the 64-byte
 * `seed||pubkey` form returned by `Keypair.secretKey`, or a raw 32-byte
 * seed). Returns the 80-byte fixed-size plaintext; use `unframePsk()` to
 * extract the variable-length payload.
 *
 * No length argument: the receiver doesn't need to know the original
 * payload length, which is exactly the property the AAA daemon needs.
 */
export function openAsRecipient(
  recipientEd25519Secret: Uint8Array | Buffer,
  sealed: Buffer,
): Buffer {
  if (sealed.length !== SEALED_PAYLOAD_LEN) {
    throw new Error(`sealed must be ${SEALED_PAYLOAD_LEN} bytes`)
  }
  const seed = asSeed(recipientEd25519Secret)
  const x25519Sk = ed25519SeedToX25519(seed)
  const x25519Pk = nacl.box.keyPair.fromSecretKey(x25519Sk).publicKey
  const opened = sealedbox.open(new Uint8Array(sealed), x25519Pk, x25519Sk)
  if (!opened) {
    throw new Error('sealed-box decryption failed (auth tag mismatch)')
  }
  // opened.length === FIXED_PLAINTEXT_LEN
  return Buffer.from(opened)
}

export interface ParsedSealedEnvelope {
  ephemeralPublicKey: Buffer // 32 bytes (X25519)
  cipherAndTag: Buffer
}

export function parseSealedEnvelope(sealed: Buffer): ParsedSealedEnvelope {
  if (sealed.length !== SEALED_PAYLOAD_LEN) {
    throw new Error(`sealed must be ${SEALED_PAYLOAD_LEN} bytes`)
  }
  return {
    ephemeralPublicKey: Buffer.from(sealed.subarray(0, 32)),
    cipherAndTag: Buffer.from(sealed.subarray(32)),
  }
}

/**
 * Cheap structural check used by the sim-side `credential-sealed-well-formed`
 * invariant. Confirms the ephemeral pubkey portion has at least some
 * non-zero bytes (any real curve25519 point will).
 */
export function isWellFormedSealed(sealed: Buffer): boolean {
  if (sealed.length !== SEALED_PAYLOAD_LEN) return false
  const eph = sealed.subarray(0, 32)
  for (let i = 0; i < eph.length; i++) {
    if (eph[i] !== 0) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Versioned plaintext framing for credential payloads
// ---------------------------------------------------------------------------
// Inside the encrypted payload we carry a small header so the AAA side
// can dispatch on plaintext kind without coupling to a specific method.
// Plaintext is ALWAYS 80 bytes (the fixed-size envelope budget); the
// length byte tells the receiver how many of the trailing bytes are real.
//
//   [u8;1]    plaintext_version  (= 1)
//   [u8;1]    plaintext_kind     (1 = psk-utf8)
//   [u8;1]    psk_len            (1..=63)
//   [u8;77]   payload            (psk_len real bytes, then zero pad)
//
// Total framed length is always 80. Hides PSK length from anyone who can
// see the ciphertext. Fits any PSK ≤ 77 bytes (well above the 63-byte
// WPA limit).

export const PLAINTEXT_VERSION = 1
export const FRAMED_LEN = 80
const PSK_BYTES_BUDGET = FRAMED_LEN - 3 // 77

export enum PlaintextKind {
  PskUtf8 = 1,
}

export function framePsk(psk: string | Buffer): Buffer {
  const pskBytes = typeof psk === 'string' ? Buffer.from(psk, 'utf8') : psk
  if (pskBytes.length < 1 || pskBytes.length > 63) {
    throw new Error(`PSK length must be 1..=63 bytes; got ${pskBytes.length}`)
  }
  const out = Buffer.alloc(FRAMED_LEN, 0)
  out[0] = PLAINTEXT_VERSION
  out[1] = PlaintextKind.PskUtf8
  out[2] = pskBytes.length
  pskBytes.copy(out, 3)
  // bytes [3 + pskBytes.length, 80) are zero-padded
  return out
}

export function unframePsk(framed: Buffer): string {
  if (framed.length !== FRAMED_LEN) {
    throw new Error(`framed plaintext must be ${FRAMED_LEN} bytes (got ${framed.length})`)
  }
  const version = framed[0]
  const kind = framed[1]
  const len = framed[2]
  if (version !== PLAINTEXT_VERSION) {
    throw new Error(`unsupported plaintext version: ${version}`)
  }
  if (kind !== PlaintextKind.PskUtf8) {
    throw new Error(`unsupported plaintext kind: ${kind}`)
  }
  if (len < 1 || len > PSK_BYTES_BUDGET) {
    throw new Error(`framed PSK length out of range: ${len}`)
  }
  return framed.subarray(3, 3 + len).toString('utf8')
}
