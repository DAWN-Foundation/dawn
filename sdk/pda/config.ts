import { PublicKey } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'
import { Dawn } from '../../target/types/dawn'

export function getTokenConfigPda(program: Program<Dawn>): PublicKey {
  const [tokenConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('token')],
    program.programId,
  )

  return tokenConfigPda
}

export function getConfigPda(program: Program<Dawn>): [PublicKey, number] {
  const [configPda, configBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )

  return [configPda, configBump]
}

export function getConfigPdaWithProgramId(
  programId: PublicKey,
): [PublicKey, number] {
  const [configPda, configBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    programId,
  )

  return [configPda, configBump]
}

export function getFeePoolDawnAccountPda(program: Program<Dawn>): PublicKey {
  const [feePoolDawnAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('fee_pool_dawn_account')],
    program.programId,
  )

  return feePoolDawnAccountPda
}

export function getDaoDawnAccountPda(program: Program<Dawn>): PublicKey {
  const [daoDawnAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('dao_dawn_account')],
    program.programId,
  )

  return daoDawnAccountPda
}

export function getValidatorDawnAccountPda(program: Program<Dawn>): PublicKey {
  const [validatorDawnAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('validator_dawn_account')],
    program.programId,
  )

  return validatorDawnAccountPda
}

export function getMedallionDawnAccountPda(program: Program<Dawn>): PublicKey {
  const [medallionDawnAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('medallion_dawn_account')],
    program.programId,
  )

  return medallionDawnAccountPda
}
