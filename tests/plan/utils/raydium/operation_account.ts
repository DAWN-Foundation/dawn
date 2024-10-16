import * as anchor from '@coral-xyz/anchor'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import { getRaydiumProgram, OPERATION_SEED } from '.'

export async function createOperationAccount(
  provider: anchor.AnchorProvider,
  payer: anchor.web3.Keypair,
  raydium: PublicKey,
) {
  const program = getRaydiumProgram(provider)

  const [operationAccountPda] = PublicKey.findProgramAddressSync(
    [Buffer.from(OPERATION_SEED)],
    raydium, // Program ID of the Raydium program
  )

  // Send the transaction to create the operation account
  await program.methods
    .createOperationAccount()
    .accounts({
      owner: payer.publicKey, // Payer who is creating the operation account
      operationState: operationAccountPda, // PDA of the operation account
      systemProgram: anchor.web3.SystemProgram.programId, // System program
    })
    .signers([payer]) // Sign with the payer's keypair
    .rpc()

  console.log('Operation account created', operationAccountPda.toBase58())

  return operationAccountPda
}
