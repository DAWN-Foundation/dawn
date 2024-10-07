import { getConfig, connect } from './utils'

async function main() {
  const { program } = await connect()
  console.log('PROGRAM_ID', program.programId.toBase58())

  const config = await getConfig()
  const configAccount = await program.account.config.fetch(config.configPda)

  console.log({
    authority: configAccount.authority.toString(),
    dawnFee: configAccount.dawnFee.toString(),
    andrenaFee: configAccount.andrenaFee.toString(),
    andrenaDawnRatio: configAccount.andrenaDawnRatio.toString(),
    boDawnRatio: configAccount.boDawnRatio.toString(),
    boEscrowRatio: configAccount.boEscrowRatio.toString(),
    usdcMint: configAccount.usdcMint.toBase58(),
    dawnMint: configAccount.dawnMint.toBase58(),
    andrenaUsdcAccount: configAccount.andrenaUsdcAccount.toBase58(),
    andrenaDawnAccount: configAccount.andrenaDawnAccount.toBase58(),
    dawnUsdcAccount: configAccount.dawnUsdcAccount.toBase58(),
    bump: configAccount.bump.toString(),
  })
}

main().catch(console.error)
