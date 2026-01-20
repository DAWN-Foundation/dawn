import { connectPob, submitTx } from '../../shared/cli-utils'
import {
  getPobConfigPda,
  getProverPda,
  getProverVaultPda,
} from '../../../sdk/pda/pob'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  const [configPda] = getPobConfigPda(pobProgram)
  const [proverPda] = getProverPda(pobProgram, wallet.publicKey)
  const [proverVaultPda] = getProverVaultPda(pobProgram, proverPda)

  console.log('Requesting prover unstake...')
  console.log({
    authority: wallet.publicKey.toBase58(),
    proverPda: proverPda.toBase58(),
    proverVaultPda: proverVaultPda.toBase58(),
  })

  // Check current state
  const prover = await pobProgram.account.prover.fetch(proverPda)
  if (prover.unstakeRequestedSlot.toNumber() !== 0) {
    console.warn(
      `⚠️  Warning: Unstake already requested at slot ${prover.unstakeRequestedSlot}`,
    )
  }

  const itx = await pobProgram.methods
    .requestUnstakeProver()
    .accountsPartial({
      authority: wallet.publicKey,
      config: configPda,
      prover: proverPda,
      proverVault: proverVaultPda,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ Prover unstake requested successfully')

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
