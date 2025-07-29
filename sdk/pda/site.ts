import { Program } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'

export function getSitePda(
  program: Program<Dawn>,
  serviceProvider: Keypair,
  siteName: string,
) {
  const [sitePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('site'),
      Buffer.from(serviceProvider.publicKey.toBytes()),
      Buffer.from(siteName),
    ],
    program.programId,
  )

  return sitePda
}
