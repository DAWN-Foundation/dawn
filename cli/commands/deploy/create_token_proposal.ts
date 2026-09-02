import { PublicKey } from '@solana/web3.js'
import { connect } from '../../shared/cli-utils'
import { createProposal, getSquadsVaultPda } from './squads'
import { buildTokenInstructions } from './build_ixs'
import { assertProgramMatchesNetwork, requireMultisigFlag } from './guards'
import { getTxSigner } from './signer'

async function main() {
  const multisigPda = new PublicKey(requireMultisigFlag())
  const { program, connection } = await connect()
  assertProgramMatchesNetwork(program)
  const signer = await getTxSigner()
  const vaultPda = getSquadsVaultPda(multisigPda)
  console.log({ multisig: multisigPda.toBase58(), vault: vaultPda.toBase58(), proposer: signer.publicKey.toBase58() })

  const innerInstructions = await buildTokenInstructions(program, vaultPda)
  const res = await createProposal({
    connection, signer, multisigPda, innerInstructions,
    memo: 'DAWN token init (init_token + init_fee_accounts)',
  })
  console.log('Proposal A created', { transactionIndex: res.transactionIndex.toString(), ...res })
}

main().catch((e) => { console.error(e); process.exit(1) })
