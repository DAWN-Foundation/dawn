import * as multisig from '@sqds/multisig'
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from '@solana/web3.js'

export const SQUADS_VAULT_INDEX = 0

export function getSquadsVaultPda(multisigPda: PublicKey): PublicKey {
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: SQUADS_VAULT_INDEX })
  return vaultPda
}

export async function nextTransactionIndex(
  connection: Connection,
  multisigPda: PublicKey,
): Promise<bigint> {
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  return BigInt(ms.transactionIndex.toString()) + 1n
}

export async function createProposal(params: {
  connection: Connection
  proposer: Keypair
  multisigPda: PublicKey
  innerInstructions: TransactionInstruction[]
  memo: string
}): Promise<{ transactionIndex: bigint; createSig: string; proposalSig: string }> {
  const { connection, proposer, multisigPda, innerInstructions, memo } = params
  const vaultPda = getSquadsVaultPda(multisigPda)
  const transactionIndex = await nextTransactionIndex(connection, multisigPda)

  const { blockhash } = await connection.getLatestBlockhash()
  const transactionMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: innerInstructions,
  })

  const createSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: proposer,
    multisigPda,
    transactionIndex,
    creator: proposer.publicKey,
    vaultIndex: SQUADS_VAULT_INDEX,
    ephemeralSigners: 0,
    transactionMessage,
    memo,
  })
  await connection.confirmTransaction(createSig, 'confirmed')

  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: proposer,
    multisigPda,
    transactionIndex,
    creator: proposer,
  })
  await connection.confirmTransaction(proposalSig, 'confirmed')

  return { transactionIndex, createSig, proposalSig }
}
