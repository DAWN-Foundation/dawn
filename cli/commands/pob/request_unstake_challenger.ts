import { connectPob, submitTx } from '../../shared/cli-utils'
import {
  getPobConfigPda,
  getChallengerPda,
  getChallengerVaultPda,
} from '../../../sdk/pda/pob'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  const [configPda] = getPobConfigPda(pobProgram)
  const [challengerPda] = getChallengerPda(pobProgram, wallet.publicKey)
  const [challengerVaultPda] = getChallengerVaultPda(pobProgram, challengerPda)

  console.log('Requesting challenger unstake...')
  console.log({
    authority: wallet.publicKey.toBase58(),
    challengerPda: challengerPda.toBase58(),
    challengerVaultPda: challengerVaultPda.toBase58(),
  })

  // Check current state
  const challenger = await pobProgram.account.challenger.fetch(challengerPda)
  if (challenger.unstakeRequestedSlot.toNumber() !== 0) {
    console.warn(
      `⚠️  Warning: Unstake already requested at slot ${challenger.unstakeRequestedSlot}`,
    )
  }

  const itx = await pobProgram.methods
    .requestUnstakeChallenger()
    .accountsPartial({
      authority: wallet.publicKey,
      config: configPda,
      challenger: challengerPda,
      challengerVault: challengerVaultPda,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ Challenger unstake requested successfully')

  // Get cooldown info
  const config = await pobProgram.account.config.fetch(configPda)
  const currentSlot = await connection.getSlot()
  const cooldownEndSlot = currentSlot + config.unstakeCooldownSlots.toNumber()

  console.log('\n⏳ Cooldown Information:')
  console.log('Current Slot:', currentSlot)
  console.log('Cooldown Slots:', config.unstakeCooldownSlots.toString())
  console.log('Can Complete At Slot:', cooldownEndSlot)
}

main().catch(console.error)
