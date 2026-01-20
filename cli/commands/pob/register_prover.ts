import { connectPob, submitTx } from '../../shared/cli-utils'
import {
  getPobConfigPda,
  getProverPda,
  getProverVaultPda,
  getStakeTokenAta,
} from '../../../sdk/pda/pob'
import { SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  const [configPda] = getPobConfigPda(pobProgram)
  const config = await pobProgram.account.config.fetch(configPda)

  const [proverPda] = getProverPda(pobProgram, wallet.publicKey)
  const [proverVaultPda] = getProverVaultPda(pobProgram, proverPda)
  const userTokenAccount = getStakeTokenAta(wallet.publicKey, config.stakeMint)

  console.log('Registering prover...')
  console.log({
    authority: wallet.publicKey.toBase58(),
    proverPda: proverPda.toBase58(),
    proverVaultPda: proverVaultPda.toBase58(),
    stakeMint: config.stakeMint.toBase58(),
    stakeAmount: config.proverStakeAmount.toString(),
  })

  const itx = await pobProgram.methods
    .registerProver()
    .accountsPartial({
      authority: wallet.publicKey,
      config: configPda,
      stakeMint: config.stakeMint,
      prover: proverPda,
      userTokenAccount,
      proverVault: proverVaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ Prover registered successfully')
  console.log('Prover PDA:', proverPda.toBase58())
  console.log('Vault PDA:', proverVaultPda.toBase58())
}

main().catch(console.error)
