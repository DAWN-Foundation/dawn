import * as anchor from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} from '@solana/spl-token'

export async function fund(
  connection: anchor.web3.Connection,
  account: PublicKey,
  amount: number,
) {
  const signature = await connection.requestAirdrop(account, amount * 10 ** 9)

  await connection.confirmTransaction(
    {
      signature,
      blockhash: (await connection.getLatestBlockhash()).blockhash,
      lastValidBlockHeight: (
        await connection.getLatestBlockhash()
      ).lastValidBlockHeight,
    },
    'confirmed',
  )
}

export async function setup(
  connection: anchor.web3.Connection,
  payer: anchor.web3.Signer,
  mintAuthority: PublicKey,
) {
  // Create Andrena KeyPair
  const andrena = Keypair.generate()
  await fund(connection, andrena.publicKey, 1000)

  // Create Tester KeyPair
  const tester = Keypair.generate()
  await fund(connection, tester.publicKey, 1000)

  // Mint test USDC token
  const usdcMint = await createMint(
    connection,
    payer, // Payer for transaction
    mintAuthority, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for USDC)
  )
  // Mint test DAWN token
  const dawnMint = await createMint(
    connection,
    payer, // Payer for transaction
    mintAuthority, // Mint authority
    null, // Freeze authority
    9, // Decimals (9 decimals for DAWN)
  )

  // Create USDC account for Andrena
  const andrenaUsdcAccount = await createAccount(
    connection,
    andrena,
    usdcMint,
    TOKEN_PROGRAM_ID,
  )
  // Create DAWN account for Andrena
  const andrenaDawnAccount = await createAccount(
    connection,
    andrena,
    dawnMint,
    TOKEN_PROGRAM_ID,
  )
  // Create USDC account for Tester
  const testerUsdcAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    tester,
    usdcMint,
    TOKEN_PROGRAM_ID,
  )

  // Mint 1'000 USDC to tester account
  await mintTo(
    connection,
    tester, // Payer for tx
    usdcMint, // Mint account
    testerUsdcAccount.address, // Destination
    payer, // Authority
    1_000 * 10 ** 6, // Mint 1,000 USDC (remember 6 decimals)
  )

  return {
    andrena,
    tester,
    usdcMint,
    dawnMint,
    andrenaUsdcAccount,
    andrenaDawnAccount,
    testerUsdcAccount,
  }
}
