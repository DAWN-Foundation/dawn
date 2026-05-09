/**
 * PSK / MPSK byte-layout helpers.
 *
 * Mirrors `programs/dawn/src/app/amf/psk_method.rs::PSKMethodParams`:
 *
 *   security_standard:        u8         //  1
 *   encryption_algorithm:     u8         //  1
 *   psk_rotation_interval:    u32 LE     //  4
 *   ssid_2_4ghz_len:          u8         //  1
 *   ssid_2_4ghz:              [u8; 32]   // 32
 *   ssid_5ghz_len:            u8         //  1
 *   ssid_5ghz:                [u8; 32]   // 32
 *   ssid_6ghz_len:            u8         //  1
 *   ssid_6ghz:                [u8; 32]   // 32
 *   _reserved:                [u8; 23]   // 23
 *                                         = 128
 *
 * Stored as the first 128 bytes of AuthMethod.parameters[256]. Trailing
 * 128 bytes are zero-padded (room for future per-band fields).
 *
 * Per-band SSIDs: `len == 0` means the band is not active. At least one
 * band must be populated. Same security_standard + encryption_algorithm
 * + rotation_interval applies to all populated bands.
 */

// ---------------------------------------------------------------------------
// Param-layout enums
// ---------------------------------------------------------------------------

export enum WiFiSecurityStandard {
  WPA2_PSK = 0,
  WPA3_PSK = 1,
}

export enum WiFiEncryption {
  AES_CCMP = 0, // WPA2
  AES_GCMP = 1, // WPA3
  AES_GCMP_256 = 2, // WPA3 strong
}

/** Radio band a band-slot represents. Used by helpers to address the
 *  3 SSID slots by band rather than by position. */
export enum RadioBand {
  TwoFourGHz = 0,
  FiveGHz = 1,
  SixGHz = 2,
}

// ---------------------------------------------------------------------------
// PSKMethodParams (128 bytes, parsed from AuthMethod.parameters[..128])
// ---------------------------------------------------------------------------

export const PSK_METHOD_PARAMS_SIZE = 128
export const SSID_LABEL_MAX = 32

export interface SsidSlot {
  /** SSID label, 1..=32 utf-8 bytes. Empty string means inactive band. */
  label: string
}

export interface PSKMethodParams {
  securityStandard: WiFiSecurityStandard
  encryptionAlgorithm: WiFiEncryption
  /** Seconds. 0 = no rotation; otherwise must be in [3600, 604800]. */
  pskRotationIntervalSec: number
  /** Per-band SSID labels. Empty string = band not active. At least
   *  one of the three must be non-empty. */
  ssid2_4GHz: string
  ssid5GHz: string
  ssid6GHz: string
}

/** Build secure defaults populated for one band (Mixed → all three). */
export function defaultPskParams(opts: {
  ssidLabel: string
  bands: 'all' | RadioBand[]
}): PSKMethodParams {
  const all = opts.bands === 'all'
  const has = (b: RadioBand) => all || (opts.bands as RadioBand[]).includes(b)
  return {
    securityStandard: WiFiSecurityStandard.WPA3_PSK,
    encryptionAlgorithm: WiFiEncryption.AES_GCMP,
    pskRotationIntervalSec: 86400,
    ssid2_4GHz: has(RadioBand.TwoFourGHz) ? opts.ssidLabel : '',
    ssid5GHz: has(RadioBand.FiveGHz) ? opts.ssidLabel : '',
    ssid6GHz: has(RadioBand.SixGHz) ? opts.ssidLabel : '',
  }
}

/** Encode the full 256-byte AuthMethod parameters buffer. The first 128
 *  bytes are PSKMethodParams; the trailing 128 are reserved zero bytes. */
export function encodePSKMethodParams(p: PSKMethodParams): Buffer {
  const buf = Buffer.alloc(256, 0)
  let o = 0
  buf.writeUInt8(p.securityStandard, o); o += 1
  buf.writeUInt8(p.encryptionAlgorithm, o); o += 1
  buf.writeUInt32LE(p.pskRotationIntervalSec >>> 0, o); o += 4
  o = writeBandSlot(buf, o, p.ssid2_4GHz)
  o = writeBandSlot(buf, o, p.ssid5GHz)
  o = writeBandSlot(buf, o, p.ssid6GHz)
  // bytes [o, 128) are the 23-byte _reserved within PSKMethodParams.
  // bytes [128, 256) are the trailing reserved part of the 256-byte
  // AuthMethod.parameters buffer.
  return buf
}

function writeBandSlot(buf: Buffer, offset: number, label: string): number {
  const bytes = Buffer.from(label, 'utf8')
  if (bytes.length > SSID_LABEL_MAX) {
    throw new Error(
      `SSID label "${label}" is ${bytes.length} bytes; max ${SSID_LABEL_MAX}`,
    )
  }
  buf.writeUInt8(bytes.length, offset)
  bytes.copy(buf, offset + 1)
  return offset + 1 + SSID_LABEL_MAX
}

/** Decode the leading 128 bytes back to typed PSKMethodParams. */
export function decodePSKMethodParams(parameters256: Buffer): PSKMethodParams {
  if (parameters256.length !== 256) {
    throw new Error(
      `parameters256 must be 256 bytes, got ${parameters256.length}`,
    )
  }
  let o = 0
  const securityStandard = parameters256.readUInt8(o) as WiFiSecurityStandard
  o += 1
  const encryptionAlgorithm = parameters256.readUInt8(o) as WiFiEncryption
  o += 1
  const pskRotationIntervalSec = parameters256.readUInt32LE(o)
  o += 4
  const ssid2_4GHz = readBandSlot(parameters256, o); o += 1 + SSID_LABEL_MAX
  const ssid5GHz = readBandSlot(parameters256, o); o += 1 + SSID_LABEL_MAX
  const ssid6GHz = readBandSlot(parameters256, o); o += 1 + SSID_LABEL_MAX
  return {
    securityStandard,
    encryptionAlgorithm,
    pskRotationIntervalSec,
    ssid2_4GHz,
    ssid5GHz,
    ssid6GHz,
  }
}

function readBandSlot(buf: Buffer, offset: number): string {
  const len = buf.readUInt8(offset)
  if (len === 0) return ''
  if (len > SSID_LABEL_MAX) {
    throw new Error(`band slot len out of range: ${len}`)
  }
  return buf.subarray(offset + 1, offset + 1 + len).toString('utf8')
}

/** Mirror of PSKMethodParams::validate(). Throws on the same conditions
 *  the on-chain program would reject. Use this in tests / scenarios to
 *  fail-fast before submitting a doomed tx. */
export function validatePskParams(p: PSKMethodParams): void {
  if (p.securityStandard > WiFiSecurityStandard.WPA3_PSK) {
    throw new Error(
      `PSKMethodParams.security_standard out of range: ${p.securityStandard}`,
    )
  }
  if (p.encryptionAlgorithm > WiFiEncryption.AES_GCMP_256) {
    throw new Error(
      `PSKMethodParams.encryption_algorithm out of range: ${p.encryptionAlgorithm}`,
    )
  }
  if (
    p.pskRotationIntervalSec !== 0 &&
    (p.pskRotationIntervalSec < 3600 || p.pskRotationIntervalSec > 604800)
  ) {
    throw new Error(
      `PSKMethodParams.psk_rotation_interval out of range: ${p.pskRotationIntervalSec}`,
    )
  }
  const any = p.ssid2_4GHz.length + p.ssid5GHz.length + p.ssid6GHz.length > 0
  if (!any) {
    throw new Error('PSKMethodParams: at least one band must be active')
  }
  for (const [band, label] of [
    ['2.4GHz', p.ssid2_4GHz],
    ['5GHz', p.ssid5GHz],
    ['6GHz', p.ssid6GHz],
  ] as const) {
    const bytes = Buffer.from(label, 'utf8')
    if (bytes.length > SSID_LABEL_MAX) {
      throw new Error(`${band} SSID exceeds ${SSID_LABEL_MAX} bytes`)
    }
  }
}

/** Convenience: list the active bands, in band order. */
export function activeBands(p: PSKMethodParams): RadioBand[] {
  const out: RadioBand[] = []
  if (p.ssid2_4GHz.length > 0) out.push(RadioBand.TwoFourGHz)
  if (p.ssid5GHz.length > 0) out.push(RadioBand.FiveGHz)
  if (p.ssid6GHz.length > 0) out.push(RadioBand.SixGHz)
  return out
}
