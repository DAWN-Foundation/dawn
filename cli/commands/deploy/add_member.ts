import * as multisig from '@sqds/multisig'
import { PublicKey } from '@solana/web3.js'
import { getConnection, getWallet, getFlag } from '../../shared/cli-utils'

const { Permissions } = multisig.types

/**
 * Add a member (by pubkey) to an existing Squads v4 multisig.
 *
 * The multisig created by `create_multisig.ts` is autonomous
 * (configAuthority = null), so a config change goes through a config
 * transaction + proposal + approval + execution. This script drives the
 * whole lifecycle with the deployer wallet, which works as long as that
 * wallet is a member whose single approval meets the current threshold —
 * true for the default 1-of-1. The new member gets full permissions
 * (initiate + vote + execute); adding a member does not change the
 * threshold, so a 1-of-1 becomes 1-of-2.
 *
 * Usage:
 *   yarn dawn:deploy:add-member --devnet --multisig <multisig> --member <new-member-pubkey>
 */
async function main() {
  const multisigStr = getFlag('--multisig')
  const memberStr = getFlag('--member')
  if (!multisigStr) {
    console.error('--multisig <pubkey> is required')
    process.exit(1)
  }
  if (!memberStr) {
    console.error('--member <pubkey> is required (the new member to add)')
    process.exit(1)
  }
  const multisigPda = new PublicKey(multisigStr)
  const newMember = new PublicKey(memberStr)

  const connection = getConnection()
  const signer = getWallet().payer // an existing member whose approval meets the threshold

  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  if (ms.members.some((m) => m.key.equals(newMember))) {
    console.log(`${newMember.toBase58()} is already a member of ${multisigPda.toBase58()}`)
    return
  }
  const transactionIndex = BigInt(ms.transactionIndex.toString()) + 1n

  console.log('Adding member via config transaction...', {
    rpc: connection.rpcEndpoint,
    multisig: multisigPda.toBase58(),
    newMember: newMember.toBase58(),
    signer: signer.publicKey.toBase58(),
    transactionIndex: transactionIndex.toString(),
  })

  // 1. Config transaction: AddMember with full permissions (vote + execute + initiate).
  const createSig = await multisig.rpc.configTransactionCreate({
    connection,
    feePayer: signer,
    multisigPda,
    transactionIndex,
    creator: signer.publicKey,
    actions: [
      {
        __kind: 'AddMember',
        newMember: { key: newMember, permissions: Permissions.all() },
      },
    ],
  })
  // Each following step validates on-chain state written by the previous one
  // (the multisig's transaction_index, then the proposal, then its approval).
  // Wait for FINALITY between them: a load-balanced RPC (e.g.
  // api.devnet.solana.com) may otherwise route the next call to a node that
  // hasn't applied the prior tx yet, causing InvalidTransactionIndex / missing
  // account errors. Finality is fork-proof, so every node sees it (slower —
  // roughly 10-15s per step on devnet).
  console.log('  waiting for finality (create)...')
  await connection.confirmTransaction(createSig, 'finalized')

  // 2. Proposal for that config transaction.
  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: signer,
    multisigPda,
    transactionIndex,
    creator: signer,
  })
  console.log('  waiting for finality (proposal)...')
  await connection.confirmTransaction(proposalSig, 'finalized')

  // 3. Approve (this signer). With a 1-of-1 this single approval meets the threshold.
  const approveSig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: signer,
    member: signer,
    multisigPda,
    transactionIndex,
  })
  console.log('  waiting for finality (approve)...')
  await connection.confirmTransaction(approveSig, 'finalized')

  // 4. Execute the config change (requires approvals >= threshold).
  const executeSig = await multisig.rpc.configTransactionExecute({
    connection,
    feePayer: signer,
    multisigPda,
    transactionIndex,
    member: signer,
    rentPayer: signer,
  })
  await connection.confirmTransaction(executeSig, 'confirmed')

  const updated = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  console.log('\n✅ Member added')
  console.log('  member    :', newMember.toBase58())
  console.log('  members   :', updated.members.map((m) => m.key.toBase58()))
  console.log(
    '  threshold :',
    updated.threshold,
    `(now ${updated.threshold}-of-${updated.members.length})`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
