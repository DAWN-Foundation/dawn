import { execSync } from 'child_process'
import { PublicKey } from '@solana/web3.js'

export async function createAmmConfig(
  raydium: PublicKey,
  mint0: PublicKey,
  mint1: PublicKey,
) {
  const index = 0
  const tickSpacing = 1
  const tradeFeeRate = 30_000
  const protocolFeeRate = 5_000
  const fundFeeRate = 2_000

  const indexBuffer = Buffer.alloc(2) // 2 bytes for a 16-bit integer
  indexBuffer.writeUInt16LE(index)

  const [ammConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('amm_config'), indexBuffer],
    raydium,
  )

  const output = execSync(
    `../raydium-clmm/target/release/client \
    --mint0 ${mint0.toBase58()} \
    --mint1 ${mint1.toBase58()} \
    create-config ${index} ${tickSpacing} ${tradeFeeRate} ${protocolFeeRate} ${fundFeeRate}`,
    { encoding: 'utf-8' },
  )
  console.log(output)

  console.log('Amm config created', ammConfigPda.toBase58())

  return ammConfigPda
}
