import { PublicKey } from '@solana/web3.js'
import { getOrganizationPda, OrganizationType } from '../utils'
import { getMock, connect } from './utils'

async function main() {
  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const mock = getMock()
  console.log({ CONFIG_PDA: mock.configPda.toBase58() })

  const configAccount = await program.account.config.fetch(mock.configPda)

  console.log({
    authority: configAccount.authority.toString(),
    bump: configAccount.bump.toString(),
    daoFee: configAccount.daoFee.toString(),
    validatorFee: configAccount.validatorFee.toString(),
    medallionFee: configAccount.medallionFee.toString(),
    usdcMint: configAccount.usdcMint.toBase58(),
    dawnMint: configAccount.dawnMint.toBase58(),
    daoDawnAccount: configAccount.daoDawnAccount.toBase58(),
    validatorDawnAccount: configAccount.validatorDawnAccount.toBase58(),
    medallionDawnAccount: configAccount.medallionDawnAccount.toBase58(),
    raydium: configAccount.raydium.toBase58(),
    raydiumAuthority: configAccount.raydiumAuthority.toBase58(),
    raydiumConfig: configAccount.raydiumConfig.toBase58(),
    raydiumPool: configAccount.raydiumPool.toBase58(),
    raydiumObservation: configAccount.raydiumObservation.toBase58(),
  })
}

main().catch(console.error)
