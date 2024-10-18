import { execSync } from 'child_process'
import { PublicKey } from '@solana/web3.js'

export async function swap(mint0: PublicKey, mint1: PublicKey) {
  const output = execSync(
    `../raydium-clmm/target/release/client \
      --mint0 ${mint0.toBase58()} \
      --mint1 ${mint1.toBase58()} \
      swap-v2 ${mint0.toBase58()} ${mint1.toBase58()} 10000000`,
    {
      encoding: 'utf-8',
    },
  )
  console.log('swap output', output)
}
