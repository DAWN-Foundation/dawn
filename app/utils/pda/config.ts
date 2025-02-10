import { PublicKey } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'
import { Dawn } from '../../../target/types/dawn'

export function getTokenConfigPda(program: Program<Dawn>): PublicKey {
  const [tokenConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('token')],
    program.programId,
  )

  return tokenConfigPda
}

export function getConfigPda(program: Program<Dawn>): PublicKey {
  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )

  return configPda
}
