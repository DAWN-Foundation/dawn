import { connectPob, submitTx } from '../../shared/cli-utils'
import {
  getPobConfigPda,
  getChallengerPda,
  getChallengerVaultPda,
  getStakeTokenAta,
} from '../../../sdk/pda/pob'
import { SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  const [configPda] = getPobConfigPda(pobProgram)
  const config = await pobProgram.account.config.fetch(configPda)

  const [challengerPda] = getChallengerPda(pobProgram, wallet.publicKey)
  const [challengerVaultPda] = getChallengerVaultPda(pobProgram, challengerPda)
  const userTokenAccount = getStakeTokenAta(wallet.publicKey, config.stakeMint)

  console.log('Registering challenger...')
  console.log({
    authority: wallet.publicKey.toBase58(),
    challengerPda: challengerPda.toBase58(),
    challengerVaultPda: challengerVaultPda.toBase58(),
    stakeMint: config.stakeMint.toBase58(),
    stakeAmount: config.challengerStakeAmount.toString(),
  })

  const itx = await pobProgram.methods
    .registerChallenger()
    .accountsPartial({
      authority: wallet.publicKey,
      config: configPda,
      stakeMint: config.stakeMint,
      challenger: challengerPda,
      userTokenAccount,
      challengerVault: challengerVaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ Challenger registered successfully')
  console.log('Challenger PDA:', challengerPda.toBase58())
  console.log('Vault PDA:', challengerVaultPda.toBase58())
}

main().catch(console.error)
