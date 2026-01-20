import { connectPob, getFlag } from '../../shared/cli-utils'
import { getRoundCommitmentPda } from '../../../sdk/pda/pob'
import { PublicKey } from '@solana/web3.js'

async function main() {
  const { pobProgram, connection } = await connectPob()

  // Get round from seed or PDA
  const seedHex = getFlag('--seed')
  const roundPdaStr = getFlag('--round')

  let roundPda: PublicKey
  let seed: Buffer | undefined
  if (roundPdaStr) {
    roundPda = new PublicKey(roundPdaStr)
  } else if (seedHex) {
    seed = Buffer.from(seedHex, 'hex')
    if (seed.length !== 32) {
      throw new Error('Seed must be 32 bytes (64 hex characters)')
    }
    ;[roundPda] = getRoundCommitmentPda(pobProgram, seed)
  } else {
    throw new Error('Either --seed or --round must be provided')
  }

  console.log('Fetching round commitment...')
  console.log('Round PDA:', roundPda.toBase58())
  if (seed) {
    console.log('Seed:', seed.toString('hex'))
  }

  try {
    const round = await pobProgram.account.roundCommitment.fetch(roundPda)
    const currentSlot = await connection.getSlot()

    console.log('\n🔄 Round Commitment:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Seed:', Buffer.from(round.seed).toString('hex'))
    console.log('N Packets:', round.nPackets)
    console.log('N Rounds:', round.nRounds)
    console.log('Start Slot:', round.startSlot.toString())
    console.log('End Slot:', round.endSlot.toString())
    console.log('Current Slot:', currentSlot)
    console.log('Expected Min (scaled):', round.expectedMinScaled.toString())
    console.log(
      'Data Anchor Root:',
      Buffer.from(round.dataAnchorRoot).toString('hex'),
    )
    console.log('Bump:', round.bump)

    // Status
    let status = ''
    if (currentSlot < round.startSlot.toNumber()) {
      status = '⏳ Pending (not started)'
    } else if (currentSlot <= round.endSlot.toNumber()) {
      status = '✅ Active'
    } else {
      status = '🏁 Ended'
    }
    console.log('Status:', status)

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } catch (error) {
    console.error('❌ Round not found or error fetching:', error)
    throw error
  }
}

main().catch(console.error)
