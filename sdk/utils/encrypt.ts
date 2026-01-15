import _nacl from 'tweetnacl'
import sealedbox from 'tweetnacl-sealedbox-js'
import {
  encodeUTF8,
  decodeUTF8,
  encodeBase64,
  decodeBase64,
} from 'tweetnacl-util'

// Extend nacl with sealedbox as per package docs
const nacl = _nacl as typeof _nacl & {
  sealedbox: {
    seal: (message: Uint8Array, recipientPublicKey: Uint8Array) => Uint8Array
    open: (
      sealedBox: Uint8Array,
      publicKey: Uint8Array,
      secretKey: Uint8Array,
    ) => Uint8Array | null
  }
}
nacl.sealedbox = sealedbox

// Generate a Curve25519 keypair for encryption
export function generateEncryptionKeypair() {
  const keyPair = nacl.box.keyPair()
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
  }
}

// Encrypt text using the recipient's public key
export function encryptWithPublicKey(
  plainText: string,
  recipientPublicKey: Uint8Array,
): Uint8Array {
  const messageBytes = decodeUTF8(plainText)
  const sealedBox = nacl.sealedbox.seal(messageBytes, recipientPublicKey)
  return sealedBox
}

// Decrypt text using your own secret key and your public key
export function decryptWithPrivateKey(
  encryptedText: Uint8Array,
  publicKey: Uint8Array,
  secretKey: Uint8Array,
): string | null {
  const decryptedBytes = nacl.sealedbox.open(
    encryptedText,
    publicKey,
    secretKey,
  )
  if (!decryptedBytes) return null
  return encodeUTF8(decryptedBytes)
}

// Example usage
async function _example() {
  // Step 1: Generate a keypair
  const keypair = generateEncryptionKeypair()

  // Step 2: Extract public and private keys (you can store them as base64)
  const publicKeyBase64 = encodeBase64(keypair.publicKey)
  const secretKeyBase64 = encodeBase64(keypair.secretKey)

  console.log('Public key (base64):', publicKeyBase64)
  console.log('Secret key (base64):', secretKeyBase64)

  // Step 3: Encrypt some text with the public key
  const plainText = '0'.repeat(16) // 16 characters for PSK
  const encrypted = encryptWithPublicKey(plainText, keypair.publicKey)
  console.log('Encrypted (base64):', encrypted)

  // Step 4: Decrypt using the secret key and public key
  const decrypted = decryptWithPrivateKey(
    encrypted,
    keypair.publicKey,
    keypair.secretKey,
  )
  console.log('Decrypted:', decrypted)

  // Verify it matches
  console.assert(decrypted === plainText, 'Decryption failed!')
}

// _example()
