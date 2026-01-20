import { connectPob, submitTx } from '../../shared/cli-utils'
import {
  getPobConfigPda,
  getChallengerPda,
  getChallengerVaultPda,
  getStakeTokenAta,
} from '../../../sdk/pda/pob'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  const [configPda] = getPobConfigPda(pobProgram)
  const config = await pobProgram.account.config.fetch(configPda)

  const [challengerPda] = getChallengerPda(pobProgram, wallet.publicKey)
  const [challengerVaultPda] = getChallengerVaultPda(pobProgram, challengerPda)
  const userTokenAccount = getStakeTokenAta(wallet.publicKey, config.stakeMint)

  console.log('Completing challenger unstake...')
  console.log({
    authority: wallet.publicKey.toBase58(),
    challengerPda: challengerPda.toBase58(),
    challengerVaultPda: challengerVaultPda.toBase58(),
    userTokenAccount: userTokenAccount.toBase58(),
  })

  // Check cooldown status
  const challenger = await pobProgram.account.challenger.fetch(challengerPda)
  const currentSlot = await connection.getSlot()

  if (challenger.unstakeRequestedSlot.toNumber() === 0) {
    throw new Error(
      'Unstake not requested. Run request_unstake_challenger first.',
    )
  }

  const cooldownEndSlot =
    challenger.unstakeRequestedSlot.toNumber() +
    config.unstakeCooldownSlots.toNumber()

  console.log('\n⏳ Cooldown Status:')
  console.log('Requested At Slot:', challenger.unstakeRequestedSlot.toString())
  console.log('Current Slot:', currentSlot)
  console.log('Cooldown End Slot:', cooldownEndSlot)

  if (currentSlot < cooldownEndSlot) {
    const slotsRemaining = cooldownEndSlot - currentSlot
    console.warn(
      `⚠️  Warning: Cooldown not elapsed. Need to wait ${slotsRemaining} more slots.`,
    )
  }

  const itx = await pobProgram.methods
    .completeUnstakeChallenger()
    .accountsPartial({
      authority: wallet.publicKey,
      config: configPda,
      stakeMint: config.stakeMint,
      challenger: challengerPda,
      userTokenAccount,
      challengerVault: challengerVaultPda,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ Challenger unstake completed successfully')
  console.log('Stake returned to:', userTokenAccount.toBase58())
  console.log(
    'Challenger account closed, rent returned to:',
    wallet.publicKey.toBase58(),
  )
}

main().catch(console.error)
