import { BN } from '@coral-xyz/anchor'
import { connectPob, getFlag, submitTx } from '../../shared/cli-utils'
import { getPobConfigPda } from '../../../sdk/pda/pob'
import { SystemProgram, PublicKey } from '@solana/web3.js'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  // Get parameters from flags
  const stakeMintStr = getFlag('--stake-mint')
  if (!stakeMintStr) {
    throw new Error('--stake-mint <pubkey> is required')
  }
  const stakeMint = new PublicKey(stakeMintStr)

  const roundCloseGraceSlots = getFlag('--round-close-grace-slots')
    ? new BN(getFlag('--round-close-grace-slots')!)
    : new BN(4500) // default ~1 hour at 400ms/slot

  const proverStakeAmount = getFlag('--prover-stake-amount')
    ? new BN(getFlag('--prover-stake-amount')!)
    : new BN(10_000_000_000) // default 10,000 tokens (6 decimals)

  const challengerStakeAmount = getFlag('--challenger-stake-amount')
    ? new BN(getFlag('--challenger-stake-amount')!)
    : new BN(1_000_000_000) // default 1,000 tokens (6 decimals)

  const unstakeCooldownSlots = getFlag('--unstake-cooldown-slots')
    ? new BN(getFlag('--unstake-cooldown-slots')!)
    : new BN(1_512_000) // default ~7 days

  const [configPda] = getPobConfigPda(pobProgram)

  console.log('Initializing PoB config...')
  console.log({
    configPda: configPda.toBase58(),
    stakeMint: stakeMint.toBase58(),
    roundCloseGraceSlots: roundCloseGraceSlots.toString(),
    proverStakeAmount: proverStakeAmount.toString(),
    challengerStakeAmount: challengerStakeAmount.toString(),
    unstakeCooldownSlots: unstakeCooldownSlots.toString(),
  })

  const itx = await pobProgram.methods
    .initConfig(
      roundCloseGraceSlots,
      proverStakeAmount,
      challengerStakeAmount,
      unstakeCooldownSlots,
    )
    .accountsPartial({
      authority: wallet.publicKey,
      stakeMint,
      config: configPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ PoB config initialized successfully')
  console.log('Config PDA:', configPda.toBase58())
}

main().catch(console.error)
