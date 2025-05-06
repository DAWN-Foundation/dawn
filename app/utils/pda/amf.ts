import { PublicKey } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'
import { Dawn } from '../../../target/types/dawn'
import { AuthMethodType } from '../helpers'

const methods = {
  psk: 0,
  mpsk: 1,
  wpa2Enterprise: 2,
  _8021x: 3,
  ipsecAh: 4,
  wpa3Enterprise: 5,
}

export function getAuthMethodPda(
  program: Program<Dawn>,
  methodType: AuthMethodType,
): PublicKey {
  const key = Object.keys(methodType)[0]
  const seed = methods[key]

  const [authMethodPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('auth_method'), Buffer.from([seed])],
    program.programId,
  )

  return authMethodPda
}
