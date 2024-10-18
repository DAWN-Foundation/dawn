import { execSync } from 'child_process'
import { PublicKey } from '@solana/web3.js'

export async function openPosition(
  mint0: PublicKey,
  mint1: PublicKey,
  mint0Base: boolean,
) {
  const ticks = mint0Base ? '1.975 2.025' : '0.495 0.525'
  const amount = mint0Base ? '1000000000' : '500000000000'

  console.log({
    mint0Base,
    ticks,
    amount,
  })

  const output = execSync(
    `../raydium-clmm/target/release/client \
    --mint0 ${mint0.toBase58()} \
    --mint1 ${mint1.toBase58()} \
    open-position ${ticks} ${amount}`,
    {
      encoding: 'utf-8',
    },
  )
  console.log('open position output', output)
}
