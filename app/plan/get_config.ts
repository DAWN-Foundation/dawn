import * as anchor from '@coral-xyz/anchor'
import { Connection } from '@solana/web3.js'

import { loadWallet, getConfig, getIDL } from './utils'
import { Plan } from '../../target/types/plan'

async function main() {
  const wallet = loadWallet()
  const connection = new Connection('http://127.0.0.1:8899')
  const provider = new anchor.AnchorProvider(connection, wallet)
  anchor.setProvider(provider)

  const config = await getConfig()
  const idl = await getIDL()

  const program = new anchor.Program<Plan>(idl as Plan, provider)

  console.log('PROGRAM_ID', program.programId.toBase58())

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
