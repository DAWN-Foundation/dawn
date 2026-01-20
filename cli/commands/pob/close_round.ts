import { connectPob, getFlag, submitTx } from '../../shared/cli-utils'
import { getPobConfigPda, getRoundCommitmentPda } from '../../../sdk/pda/pob'
import { PublicKey } from '@solana/web3.js'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  // Get round from seed or PDA
  const seedHex = getFlag('--seed')
  const roundPdaStr = getFlag('--round')

  let roundPda: PublicKey
  if (roundPdaStr) {
    roundPda = new PublicKey(roundPdaStr)
  } else if (seedHex) {
    const seed = Buffer.from(seedHex, 'hex')
    if (seed.length !== 32) {
      throw new Error('Seed must be 32 bytes (64 hex characters)')
    }
    ;[roundPda] = getRoundCommitmentPda(pobProgram, seed)
  } else {
    throw new Error('Either --seed or --round must be provided')
  }

  const [configPda] = getPobConfigPda(pobProgram)

  console.log('Closing challenge round...')
  console.log({
    roundPda: roundPda.toBase58(),
    beneficiary: wallet.publicKey.toBase58(),
  })

  // Check if grace period has elapsed
  const round = await pobProgram.account.roundCommitment.fetch(roundPda)
  const config = await pobProgram.account.config.fetch(configPda)
  const currentSlot = await connection.getSlot()
  const graceEndSlot =
    round.endSlot.toNumber() + config.roundCloseGraceSlots.toNumber()

  console.log({
    currentSlot,
    endSlot: round.endSlot.toNumber(),
    graceSlots: config.roundCloseGraceSlots.toNumber(),
    graceEndSlot,
  })

  if (currentSlot <= graceEndSlot) {
    console.warn(
      `⚠️  Warning: Grace period not elapsed yet. Need to wait until slot ${graceEndSlot}`,
    )
  }

  const itx = await pobProgram.methods
    .closeRound()
    .accountsPartial({
      beneficiary: wallet.publicKey,
      config: configPda,
      roundCommitment: roundPda,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ Round closed successfully')
  console.log('Rent returned to:', wallet.publicKey.toBase58())
}

main().catch(console.error)
