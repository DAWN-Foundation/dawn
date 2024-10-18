import * as anchor from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { getRaydiumProgram } from '.'

export async function createAmmConfig(
  provider: anchor.AnchorProvider,
  payer: anchor.web3.Keypair,
  raydium: PublicKey,
) {
  const program = getRaydiumProgram(provider)

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

  await program.methods
    .createAmmConfig(
      index,
      tickSpacing,
      tradeFeeRate,
      protocolFeeRate,
      fundFeeRate,
    )
    .accounts({
      owner: payer.publicKey,
      ammConfig: ammConfigPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log('Amm config created', ammConfigPda.toBase58())

  return ammConfigPda
}
