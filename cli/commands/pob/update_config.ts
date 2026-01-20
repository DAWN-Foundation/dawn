import { BN } from '@coral-xyz/anchor'
import { connectPob, getFlag, submitTx } from '../../shared/cli-utils'
import { getPobConfigPda } from '../../../sdk/pda/pob'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  const [configPda] = getPobConfigPda(pobProgram)

  // Fetch current config to use as defaults
  const currentConfig = await pobProgram.account.config.fetch(configPda)

  const roundCloseGraceSlots = getFlag('--round-close-grace-slots')
    ? new BN(getFlag('--round-close-grace-slots')!)
    : currentConfig.roundCloseGraceSlots

  const proverStakeAmount = getFlag('--prover-stake-amount')
    ? new BN(getFlag('--prover-stake-amount')!)
    : currentConfig.proverStakeAmount

  const challengerStakeAmount = getFlag('--challenger-stake-amount')
    ? new BN(getFlag('--challenger-stake-amount')!)
    : currentConfig.challengerStakeAmount

  const unstakeCooldownSlots = getFlag('--unstake-cooldown-slots')
    ? new BN(getFlag('--unstake-cooldown-slots')!)
    : currentConfig.unstakeCooldownSlots

  console.log('Updating PoB config...')
  console.log({
    configPda: configPda.toBase58(),
    roundCloseGraceSlots: roundCloseGraceSlots.toString(),
    proverStakeAmount: proverStakeAmount.toString(),
    challengerStakeAmount: challengerStakeAmount.toString(),
    unstakeCooldownSlots: unstakeCooldownSlots.toString(),
  })

  const itx = await pobProgram.methods
    .updateConfig(
      roundCloseGraceSlots,
      proverStakeAmount,
      challengerStakeAmount,
      unstakeCooldownSlots,
    )
    .accountsPartial({
      authority: wallet.publicKey,
      config: configPda,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ PoB config updated successfully')
}

main().catch(console.error)
