import { connectPob, getFlag, submitTx } from '../../shared/cli-utils'
import {
  getProverPda,
  getRoundCommitmentPda,
  getAggregatorPda,
  getReceiptPda,
} from '../../../sdk/pda/pob'
import { PublicKey } from '@solana/web3.js'

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

  // Get min token
  const minTokenHex = getFlag('--min-token')
  if (!minTokenHex) {
    throw new Error('--min-token <hex> is required')
  }
  const minToken = Buffer.from(minTokenHex, 'hex')
  if (minToken.length !== 32) {
    throw new Error('Min token must be 32 bytes (64 hex characters)')
  }

  const [receiptPda] = getReceiptPda(pobProgram, roundPda, proverPda, minToken)
  const [aggregatorPda] = getAggregatorPda(pobProgram, roundPda, proverPda)

  console.log('Closing receipt...')
  console.log({
    receiptPda: receiptPda.toBase58(),
    aggregatorPda: aggregatorPda.toBase58(),
    proverPda: proverPda.toBase58(),
    beneficiary: wallet.publicKey.toBase58(),
  })

  // Verify aggregator is finalized
  const aggregator = await pobProgram.account.aggregator.fetch(aggregatorPda)
  if (!aggregator.finalized) {
    throw new Error(
      'Aggregator must be finalized before closing receipts. Run finalize_aggregator first.',
    )
  }

  const itx = await pobProgram.methods
    .closeReceipt()
    .accountsPartial({
      beneficiary: wallet.publicKey,
      prover: proverPda,
      receipt: receiptPda,
      aggregator: aggregatorPda,
    })
    .instruction()

  await submitTx(connection, wallet, itx)
  console.log('✅ Receipt closed successfully')
  console.log('Rent returned to:', wallet.publicKey.toBase58())
}

main().catch(console.error)
