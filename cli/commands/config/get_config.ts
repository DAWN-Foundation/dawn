import { connect } from '../../shared/cli-utils'
import { getConfigPdaWithProgramId } from '../../../sdk/pda/config'

async function main() {
  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const [configPda] = getConfigPdaWithProgramId(program.programId)
  console.log({ CONFIG_PDA: configPda.toBase58() })

  const configAccount = await program.account.config.fetch(configPda)

  console.log({
    authority: configAccount.authority.toBase58(),
    apiAuthority: configAccount.apiAuthority.toBase58(),
    tokenConfig: configAccount.tokenConfig.toBase58(),
    stableMint: configAccount.stableMint.toBase58(),
    dawnMint: configAccount.dawnMint.toBase58(),
    feePoolDawnAccount: configAccount.feePoolDawnAccount.toBase58(),
    daoDawnAccount: configAccount.daoDawnAccount.toBase58(),
    validatorDawnAccount: configAccount.validatorDawnAccount.toBase58(),
    medallionDawnAccount: configAccount.medallionDawnAccount.toBase58(),
    raydium: configAccount.raydium.toBase58(),
    raydiumAuthority: configAccount.raydiumAuthority.toBase58(),
    raydiumConfig: configAccount.raydiumConfig.toBase58(),
    raydiumPool: configAccount.raydiumPool.toBase58(),
    raydiumObservation: configAccount.raydiumObservation.toBase58(),
    daoFee: configAccount.daoFee.toString(),
    validatorFee: configAccount.validatorFee.toString(),
    medallionFee: configAccount.medallionFee.toString(),
    createdAt: configAccount.createdAt.toString(),
    bump: configAccount.bump.toString(),
  })
}

main().catch(console.error)
