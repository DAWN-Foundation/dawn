import { connectPob, getFlag } from '../../shared/cli-utils'
import { getChallengerPda, getChallengerVaultPda } from '../../../sdk/pda/pob'
import { PublicKey } from '@solana/web3.js'

async function main() {
  const { wallet, pobProgram, connection } = await connectPob()

  const authorityStr = getFlag('--authority')
  const authority = authorityStr
    ? new PublicKey(authorityStr)
    : wallet.publicKey

  const [challengerPda] = getChallengerPda(pobProgram, authority)
  const [challengerVaultPda] = getChallengerVaultPda(pobProgram, challengerPda)

  console.log('Fetching challenger account...')
  console.log('Authority:', authority.toBase58())
  console.log('Challenger PDA:', challengerPda.toBase58())

  try {
    const challenger = await pobProgram.account.challenger.fetch(challengerPda)

    console.log('\n🎯 Challenger Account:')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Authority:', challenger.authority.toBase58())
    console.log('Created At Slot:', challenger.createdAtSlot.toString())
    console.log('Stake Amount:', challenger.stakeAmount.toString())
    console.log(
      'Unstake Requested Slot:',
      challenger.unstakeRequestedSlot.toString(),
    )
    console.log('Reputation:', challenger.reputation)
    console.log('Bump:', challenger.bump)
    console.log('Vault PDA:', challengerVaultPda.toBase58())

    // Try to fetch vault balance
    try {
      const vaultAccount = await connection.getAccountInfo(challengerVaultPda)
      if (vaultAccount) {
        console.log('Vault Status: ✅ Active')
      }
    } catch (err) {
      console.log('Vault Status: ❌ Not found')
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  } catch (error) {
    console.error('❌ Challenger not found or error fetching:', error)
    throw error
  }
}

main().catch(console.error)
