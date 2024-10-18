import { execSync } from 'child_process'
import { PublicKey } from '@solana/web3.js'

export async function createOperationAccount(
  mint0: PublicKey,
  mint1: PublicKey,
) {
  const output = execSync(
    `../raydium-clmm/target/release/client \
    --mint0 ${mint0.toBase58()} \
    --mint1 ${mint1.toBase58()} \
    create-operation`,
    { encoding: 'utf-8' },
  )
  console.log(output)
  console.log('Operation account created')
}
