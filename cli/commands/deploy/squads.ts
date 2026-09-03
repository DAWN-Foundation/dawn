import * as multisig from '@sqds/multisig'
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from '@solana/web3.js'
import { TxSigner, signSendConfirm } from './signer'

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
  signer: TxSigner
  multisigPda: PublicKey
  innerInstructions: TransactionInstruction[]
  memo: string
}): Promise<{ transactionIndex: bigint; createSig: string; proposalSig: string }> {
  const { connection, signer, multisigPda, innerInstructions, memo } = params
  const vaultPda = getSquadsVaultPda(multisigPda)
  const transactionIndex = await nextTransactionIndex(connection, multisigPda)

  const { blockhash } = await connection.getLatestBlockhash()
  const transactionMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: innerInstructions,
  })

  const createIx = multisig.instructions.vaultTransactionCreate({
    multisigPda,
    transactionIndex,
    creator: signer.publicKey,
    vaultIndex: SQUADS_VAULT_INDEX,
    ephemeralSigners: 0,
    transactionMessage,
    memo,
  })
  // Wait for finality before proposalCreate: it validates the (now
  // incremented) on-chain multisig.transaction_index, and a load-balanced RPC
  // (e.g. api.devnet.solana.com) may otherwise route proposalCreate to a node
  // that hasn't yet applied the create, causing InvalidTransactionIndex.
  const createSig = await signSendConfirm(connection, [createIx], signer, {
    commitment: 'finalized',
  })

  const proposalIx = multisig.instructions.proposalCreate({
    multisigPda,
    transactionIndex,
    creator: signer.publicKey,
  })
  const proposalSig = await signSendConfirm(connection, [proposalIx], signer, {
    commitment: 'confirmed',
  })

  return { transactionIndex, createSig, proposalSig }
}
