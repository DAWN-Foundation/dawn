import { PublicKey } from '@solana/web3.js'
import { connect, getWallet, getFlag } from '../../shared/cli-utils'
import { createProposal, getSquadsVaultPda } from './squads'
import { buildTokenInstructions } from './build_ixs'

async function main() {
  const multisigPda = new PublicKey(getFlag('--multisig'))
  const { program, connection } = await connect()
  const proposer = getWallet().payer
  const vaultPda = getSquadsVaultPda(multisigPda)
  console.log({ multisig: multisigPda.toBase58(), vault: vaultPda.toBase58(), proposer: proposer.publicKey.toBase58() })

  const innerInstructions = await buildTokenInstructions(program, vaultPda)
  const res = await createProposal({
    connection, proposer, multisigPda, innerInstructions,
    memo: 'DAWN token init (init_token + init_fee_accounts)',
  })
  console.log('Proposal A created', { transactionIndex: res.transactionIndex.toString(), ...res })
}

main().catch((e) => { console.error(e); process.exit(1) })
