import { connectPob, getFlag } from '../../shared/cli-utils'
import {
  getProverPda,
  getRoundCommitmentPda,
  getAggregatorPda,
} from '../../../sdk/pda/pob'
import { PublicKey } from '@solana/web3.js'

async function main() {
  const { wallet, pobProgram } = await connectPob()

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

  console.log('Fetching aggregator...')
  console.log('Aggregator PDA:', aggregatorPda.toBase58())

  try {
    const aggregator = await pobProgram.account.aggregator.fetch(aggregatorPda)

    console.log('\n📊 Aggregator Account:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Round:', aggregator.round.toBase58())
    console.log('Prover:', aggregator.prover.toBase58())
    console.log('Num Submissions:', aggregator.numSubmissions)
    console.log('Sum N-est (scaled):', aggregator.sumNEstScaled.toString())
    console.log('Finalized:', aggregator.finalized ? '✅ Yes' : '❌ No')
    if (aggregator.finalized) {
      console.log(
        'Finalized P-hat (scaled):',
        aggregator.finalizedPHatScaled.toString(),
      )
    }
    console.log('Version:', aggregator.version)
    console.log('Bump:', aggregator.bump)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } catch (error) {
    console.error('❌ Aggregator not found or error fetching:', error)
    throw error
  }
}

main().catch(console.error)
