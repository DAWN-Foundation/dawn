import { connectPob } from '../../shared/cli-utils'
import { getPobConfigPda } from '../../../sdk/pda/pob'

async function main() {
  const { pobProgram } = await connectPob()

  const [configPda] = getPobConfigPda(pobProgram)

  console.log('Fetching PoB config...')
  console.log('Config PDA:', configPda.toBase58())

  try {
    const config = await pobProgram.account.config.fetch(configPda)

    console.log('\n📋 PoB Configuration:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Authority:', config.authority.toBase58())
    console.log('Stake Mint:', config.stakeMint.toBase58())
    console.log(
      'Round Close Grace (slots):',
      config.roundCloseGraceSlots.toString(),
    )
    console.log('Prover Stake Amount:', config.proverStakeAmount.toString())
    console.log(
      'Challenger Stake Amount:',
      config.challengerStakeAmount.toString(),
    )
    console.log(
      'Unstake Cooldown (slots):',
      config.unstakeCooldownSlots.toString(),
    )
    console.log('Bump:', config.bump)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } catch (error) {
    console.error('❌ Config not found or error fetching:', error)
    throw error
  }
}

main().catch(console.error)
