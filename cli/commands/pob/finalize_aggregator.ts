import { connectPob, getFlag, submitTx } from '../../shared/cli-utils'
import {
  getProverPda,
  getRoundCommitmentPda,
  getAggregatorPda,
} from '../../../sdk/pda/pob'
import { PublicKey } from '@solana/web3.js'
import * as crypto from 'crypto'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  // Get round
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

  // Get prover (default to wallet)
  const proverAuthorityStr = getFlag('--prover')
  const proverAuthority = proverAuthorityStr
    ? new PublicKey(proverAuthorityStr)
    : wallet.publicKey

  const [proverPda] = getProverPda(pobProgram, proverAuthority)
  const [aggregatorPda] = getAggregatorPda(pobProgram, roundPda, proverPda)

  // Get DA snapshot pointer
  const daSnapshotPointerHex = getFlag('--da-snapshot-pointer')
  let daSnapshotPointer: Buffer
  if (daSnapshotPointerHex) {
    daSnapshotPointer = Buffer.from(daSnapshotPointerHex, 'hex')
    if (daSnapshotPointer.length !== 32) {
      throw new Error(
        'DA snapshot pointer must be 32 bytes (64 hex characters)',
      )
    }
  } else {
    daSnapshotPointer = crypto.randomBytes(32)
    console.log(
      'Generated mock DA snapshot pointer:',
      daSnapshotPointer.toString('hex'),
    )
  }

  console.log('Finalizing aggregator...')
  console.log({
    roundPda: roundPda.toBase58(),
    proverPda: proverPda.toBase58(),
    aggregatorPda: aggregatorPda.toBase58(),
    daSnapshotPointer: daSnapshotPointer.toString('hex'),
  })

  // Check if round has ended
  const round = await pobProgram.account.roundCommitment.fetch(roundPda)
  const currentSlot = await connection.getSlot()
  if (currentSlot <= round.endSlot.toNumber()) {
    console.warn(
      `⚠️  Warning: Round not ended yet. Current slot ${currentSlot}, end slot ${round.endSlot}`,
    )
  }

  const itx = await pobProgram.methods
    .finalizeAggregator(Array.from(daSnapshotPointer))
    .accountsPartial({
      proverAuthority: wallet.publicKey,
      round: roundPda,
      aggregator: aggregatorPda,
      prover: proverPda,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ Aggregator finalized successfully')

  // Fetch and display results
  const aggregator = await pobProgram.account.aggregator.fetch(aggregatorPda)
  console.log('\n📊 Finalized Aggregator:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Num Submissions:', aggregator.numSubmissions)
  console.log('P-hat (scaled):', aggregator.finalizedPHatScaled.toString())
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main().catch(console.error)
