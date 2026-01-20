import { connectPob, submitTx } from '../../shared/cli-utils'
import {
  getPobConfigPda,
  getProverPda,
  getProverVaultPda,
  getStakeTokenAta,
} from '../../../sdk/pda/pob'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  const [configPda] = getPobConfigPda(pobProgram)
  const config = await pobProgram.account.config.fetch(configPda)

  const [proverPda] = getProverPda(pobProgram, wallet.publicKey)
  const [proverVaultPda] = getProverVaultPda(pobProgram, proverPda)
  const userTokenAccount = getStakeTokenAta(wallet.publicKey, config.stakeMint)

  console.log('Completing prover unstake...')
  console.log({
    authority: wallet.publicKey.toBase58(),
    proverPda: proverPda.toBase58(),
    proverVaultPda: proverVaultPda.toBase58(),
    userTokenAccount: userTokenAccount.toBase58(),
  })

  // Check cooldown status
  const prover = await pobProgram.account.prover.fetch(proverPda)
  const currentSlot = await connection.getSlot()

  if (prover.unstakeRequestedSlot.toNumber() === 0) {
    throw new Error('Unstake not requested. Run request_unstake_prover first.')
  }

  const cooldownEndSlot =
    prover.unstakeRequestedSlot.toNumber() +
    config.unstakeCooldownSlots.toNumber()

  console.log('\n⏳ Cooldown Status:')
  console.log('Requested At Slot:', prover.unstakeRequestedSlot.toString())
  console.log('Current Slot:', currentSlot)
  console.log('Cooldown End Slot:', cooldownEndSlot)

  if (currentSlot < cooldownEndSlot) {
    const slotsRemaining = cooldownEndSlot - currentSlot
    console.warn(
      `⚠️  Warning: Cooldown not elapsed. Need to wait ${slotsRemaining} more slots.`,
    )
  }

  const itx = await pobProgram.methods
    .completeUnstakeProver()
    .accountsPartial({
      authority: wallet.publicKey,
      config: configPda,
      stakeMint: config.stakeMint,
      prover: proverPda,
      userTokenAccount,
      proverVault: proverVaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ Prover unstake completed successfully')
  console.log('Stake returned to:', userTokenAccount.toBase58())
  console.log(
    'Prover account closed, rent returned to:',
    wallet.publicKey.toBase58(),
  )
}

main().catch(console.error)
