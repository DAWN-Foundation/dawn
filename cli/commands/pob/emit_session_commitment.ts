import { connectPob, getFlag, submitTx } from '../../shared/cli-utils'
import {
  getChallengerPda,
  getProverPda,
  getRoundCommitmentPda,
} from '../../../sdk/pda/pob'
import { PublicKey } from '@solana/web3.js'
import * as crypto from 'crypto'

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

  // Get prover
  const proverAuthorityStr = getFlag('--prover')
  if (!proverAuthorityStr) {
    throw new Error('--prover <pubkey> is required')
  }
  const proverAuthority = new PublicKey(proverAuthorityStr)
  const [proverPda] = getProverPda(pobProgram, proverAuthority)

  // Get DA pointer
  const daPointerHex = getFlag('--da-pointer')
  let daPointer: Buffer
  if (daPointerHex) {
    daPointer = Buffer.from(daPointerHex, 'hex')
    if (daPointer.length !== 32) {
      throw new Error('DA pointer must be 32 bytes (64 hex characters)')
    }
  } else {
    daPointer = crypto.randomBytes(32)
    console.log('Generated mock DA pointer:', daPointer.toString('hex'))
  }

  const [challengerPda] = getChallengerPda(pobProgram, wallet.publicKey)

  console.log('Emitting session commitment...')
  console.log({
    roundPda: roundPda.toBase58(),
    challengerPda: challengerPda.toBase58(),
    proverPda: proverPda.toBase58(),
    daPointer: daPointer.toString('hex'),
  })

  // Verify we're in the active window
  const round = await pobProgram.account.roundCommitment.fetch(roundPda)
  const currentSlot = await connection.getSlot()
  if (currentSlot < round.startSlot.toNumber()) {
    console.warn(
      `⚠️  Warning: Current slot ${currentSlot} is before start slot ${round.startSlot}`,
    )
  }
  if (currentSlot > round.endSlot.toNumber()) {
    console.warn(
      `⚠️  Warning: Current slot ${currentSlot} is after end slot ${round.endSlot}`,
    )
  }

  const itx = await pobProgram.methods
    .emitSessionCommitment(Array.from(daPointer))
    .accountsPartial({
      challengerAuthority: wallet.publicKey,
      roundCommitment: roundPda,
      challenger: challengerPda,
      prover: proverPda,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ Session commitment emitted successfully')
}

main().catch(console.error)
