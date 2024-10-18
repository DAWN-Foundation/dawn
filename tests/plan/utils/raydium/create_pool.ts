import { execSync } from 'child_process'
import { PublicKey } from '@solana/web3.js'
import { POOL_SEED } from '.'

export async function createPool(
  raydium: PublicKey,
  ammConfig: PublicKey, // amm_config public key
  mint0: PublicKey,
  mint1: PublicKey,
  mint0Base: boolean,
) {
  // Derive the pool PDA
  const [poolStatePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(POOL_SEED),
      ammConfig.toBuffer(),
      mint0.toBuffer(),
      mint1.toBuffer(),
    ],
    raydium,
  )
  console.log({ pool_PDA: poolStatePda.toBase58() })

  const initialPrice = mint0Base ? '2' : '0.5'

  const output = execSync(
    `../raydium-clmm/target/release/client \
    --mint0 ${mint0.toBase58()} \
    --mint1 ${mint1.toBase58()} \
    create-pool 0 ${initialPrice} ${mint0.toBase58()} ${mint1.toBase58()}`,
    {
      encoding: 'utf-8',
    },
  )

  console.log('create pool output', output)
}
