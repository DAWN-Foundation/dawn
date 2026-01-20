import { connectPob, getFlag } from '../../shared/cli-utils'
import { getProverPda, getProverVaultPda } from '../../../sdk/pda/pob'
import { PublicKey } from '@solana/web3.js'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  const authorityStr = getFlag('--authority')
  const authority = authorityStr
    ? new PublicKey(authorityStr)
    : wallet.publicKey

  const [proverPda] = getProverPda(pobProgram, authority)
  const [proverVaultPda] = getProverVaultPda(pobProgram, proverPda)

  console.log('Fetching prover account...')
  console.log('Authority:', authority.toBase58())
  console.log('Prover PDA:', proverPda.toBase58())

  try {
    const prover = await pobProgram.account.prover.fetch(proverPda)

    console.log('\n👤 Prover Account:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Authority:', prover.authority.toBase58())
    console.log('Created At Slot:', prover.createdAtSlot.toString())
    console.log('Stake Amount:', prover.stakeAmount.toString())
    console.log(
      'Unstake Requested Slot:',
      prover.unstakeRequestedSlot.toString(),
    )
    console.log('Reputation:', prover.reputation)
    console.log('Bump:', prover.bump)
    console.log('Vault PDA:', proverVaultPda.toBase58())

    // Try to fetch vault balance
    try {
      const vaultAccount = await connection.getAccountInfo(proverVaultPda)
      if (vaultAccount) {
        console.log('Vault Status: ✅ Active')
      }
    } catch (err) {
      console.log('Vault Status: ❌ Not found')
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } catch (error) {
    console.error('❌ Prover not found or error fetching:', error)
    throw error
  }
}

main().catch(console.error)
