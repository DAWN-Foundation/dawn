import { BN } from '@coral-xyz/anchor'
import { connectPob, getFlag, submitTx } from '../../shared/cli-utils'
import {
  getProverPda,
  getRoundCommitmentPda,
  getAggregatorPda,
  getReceiptPda,
} from '../../../sdk/pda/pob'
import {
  createSessionLeaf,
  computeLeafHash,
  buildMerkleProof,
  DA_PROGRAM_ID,
  findBloberPda,
  findBlobPda,
} from '../../../sdk/utils/pob'
import { PublicKey, SystemProgram, Keypair } from '@solana/web3.js'
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

  // Get challenger
  const challengerStr = getFlag('--challenger')
  if (!challengerStr) {
    throw new Error('--challenger <pubkey> is required')
  }
  const challenger = new PublicKey(challengerStr)

  // Get prover (default to wallet)
  const [proverPda] = getProverPda(pobProgram, wallet.publicKey)

  // Get min token
  const minTokenHex = getFlag('--min-token')
  let minToken: Buffer
  if (minTokenHex) {
    minToken = Buffer.from(minTokenHex, 'hex')
    if (minToken.length !== 32) {
      throw new Error('Min token must be 32 bytes (64 hex characters)')
    }
  } else {
    minToken = crypto.randomBytes(32)
    console.log('Generated random min token:', minToken.toString('hex'))
  }

  // Get round info
  const round = await pobProgram.account.roundCommitment.fetch(roundPda)

  // Create session leaf for proof
  const roundId = getFlag('--round-id') ? BigInt(getFlag('--round-id')!) : 42n
  const sessionLeaf = createSessionLeaf(
    challenger,
    proverPda,
    roundId,
    round.nPackets,
  )

  // Build Merkle proof (in production, this would be provided)
  const leafHash = computeLeafHash(sessionLeaf)
  const siblings = getFlag('--siblings')
    ? JSON.parse(getFlag('--siblings')!).map((s: string) =>
        Buffer.from(s, 'hex'),
      )
    : [Buffer.alloc(32, 1), Buffer.alloc(32, 2)] // Mock siblings

  const { proof } = buildMerkleProof(leafHash, siblings)

  // Prepare leaf for IDL
  const leafForIdl = {
    challenger: sessionLeaf.challenger,
    prover: sessionLeaf.prover,
    roundId: new BN(sessionLeaf.roundId.toString()),
    packetRoot: Array.from(sessionLeaf.packetRoot),
    n: sessionLeaf.n,
  }

  // Data Anchor setup
  const daNamespace = getFlag('--da-namespace') || 'nitro'
  const daTimestamp = getFlag('--da-timestamp')
    ? parseInt(getFlag('--da-timestamp')!)
    : Math.floor(Date.now() / 1000)

  const daPayerStr = getFlag('--da-payer')
  let daPayer: Keypair
  if (daPayerStr) {
    const secretKey = JSON.parse(daPayerStr)
    daPayer = Keypair.fromSecretKey(Uint8Array.from(secretKey))
  } else {
    daPayer = wallet.payer
  }

  const daBloberPda = findBloberPda(daPayer.publicKey, daNamespace)
  const payloadSize = 1 + 32 + 32 + 32 // version + round + prover_authority + min_token
  const daBlobPda = findBlobPda(
    daBloberPda,
    daPayer.publicKey,
    daTimestamp,
    payloadSize,
  )

  const [aggregatorPda] = getAggregatorPda(pobProgram, roundPda, proverPda)
  const [receiptPda] = getReceiptPda(pobProgram, roundPda, proverPda, minToken)

  console.log('Submitting min hash...')
  console.log({
    roundPda: roundPda.toBase58(),
    proverPda: proverPda.toBase58(),
    aggregatorPda: aggregatorPda.toBase58(),
    receiptPda: receiptPda.toBase58(),
    minToken: minToken.toString('hex'),
    daTimestamp,
    daBloberPda: daBloberPda.toBase58(),
    daBlobPda: daBlobPda.toBase58(),
  })

  const itx = await pobProgram.methods
    .submitMinHash(leafForIdl, proof, Array.from(minToken), new BN(daTimestamp))
    .accountsPartial({
      proverAuthority: wallet.publicKey,
      prover: proverPda,
      round: roundPda,
      aggregator: aggregatorPda,
      receipt: receiptPda,
      daBlober: daBloberPda,
      daBlob: daBlobPda,
      daPayer: daPayer.publicKey,
      daProgram: DA_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  // Include daPayer as additional signer if it's different from wallet
  const additionalSigners = daPayer.publicKey.equals(wallet.publicKey)
    ? []
    : [daPayer]

  await submitTx(connection, wallet, itx, true, 'finalized', additionalSigners)
  console.log('✅ Min hash submitted successfully')
  console.log('Receipt PDA:', receiptPda.toBase58())
  console.log('Aggregator PDA:', aggregatorPda.toBase58())
}

main().catch(console.error)
