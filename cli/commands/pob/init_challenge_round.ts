import { BN } from '@coral-xyz/anchor'
import { connectPob, getFlag, submitTx } from '../../shared/cli-utils'
import { getChallengerPda, getRoundCommitmentPda } from '../../../sdk/pda/pob'
import { SystemProgram } from '@solana/web3.js'
import * as crypto from 'crypto'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  // Parse parameters
  const seedHex = getFlag('--seed')
  let seed: Buffer
  if (seedHex) {
    seed = Buffer.from(seedHex, 'hex')
    if (seed.length !== 32) {
      throw new Error('Seed must be 32 bytes (64 hex characters)')
    }
  } else {
    seed = crypto.randomBytes(32)
    console.log('Generated random seed:', seed.toString('hex'))
  }

  const nPackets = getFlag('--n-packets')
    ? parseInt(getFlag('--n-packets')!)
    : 100

  const nRounds = getFlag('--n-rounds') ? parseInt(getFlag('--n-rounds')!) : 10

  const startSlotOffset = getFlag('--start-slot-offset')
    ? parseInt(getFlag('--start-slot-offset')!)
    : 100 // default 100 slots in future

  const duration = getFlag('--duration')
    ? parseInt(getFlag('--duration')!)
    : 1000 // default 1000 slots duration

  const dataAnchorRootHex = getFlag('--data-anchor-root')
  let dataAnchorRoot: Buffer
  if (dataAnchorRootHex) {
    dataAnchorRoot = Buffer.from(dataAnchorRootHex, 'hex')
    if (dataAnchorRoot.length !== 32) {
      throw new Error('Data anchor root must be 32 bytes (64 hex characters)')
    }
  } else {
    // Generate a mock root for testing
    dataAnchorRoot = crypto.randomBytes(32)
    console.log(
      'Generated mock data anchor root:',
      dataAnchorRoot.toString('hex'),
    )
  }

  // Get current slot
  const slot = await connection.getSlot()
  const startSlot = slot + startSlotOffset
  const endSlot = startSlot + duration

  const [challengerPda] = getChallengerPda(pobProgram, wallet.publicKey)
  const [roundPda] = getRoundCommitmentPda(pobProgram, seed)

  console.log('Initializing challenge round...')
  console.log({
    seed: seed.toString('hex'),
    roundPda: roundPda.toBase58(),
    challengerPda: challengerPda.toBase58(),
    nPackets,
    nRounds,
    startSlot,
    endSlot,
    dataAnchorRoot: dataAnchorRoot.toString('hex'),
  })

  const itx = await pobProgram.methods
    .initChallengeRound(
      Array.from(seed),
      nPackets,
      nRounds,
      new BN(startSlot),
      new BN(endSlot),
      Array.from(dataAnchorRoot),
    )
    .accountsPartial({
      challengerAuthority: wallet.publicKey,
      challenger: challengerPda,
      round: roundPda,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ Challenge round initialized successfully')
  console.log('Round PDA:', roundPda.toBase58())
  console.log('Seed:', seed.toString('hex'))
}

main().catch(console.error)
