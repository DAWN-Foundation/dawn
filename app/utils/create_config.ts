import { execSync } from 'child_process'
import { BN, Idl, Program, Wallet } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { getAmmConfigAddress } from './pda'
import { RaydiumCpSwap } from '../../raydium/raydium_cp_swap'

export async function createAmmConfig(
  program: Program<RaydiumCpSwap>,
  wallet: Wallet,
) {
  const configIndex = 0
  const tradeFeeRate = new BN(10)
  const protocolFeeRate = new BN(1000)
  const fundFeeRate = new BN(25000)
  const createFee = new BN(0)

  const [configPda] = getAmmConfigAddress(configIndex, program.programId)

  // Create Amm Config
  await program.methods
    .createAmmConfig(
      configIndex,
      tradeFeeRate,
      protocolFeeRate,
      fundFeeRate,
      createFee,
    )
    .accounts({
      owner: wallet.publicKey,
      ammConfig: configPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc()

  console.log('Amm config created', configPda.toBase58())

  return configPda
}
