import * as anchor from '@coral-xyz/anchor'
import { Wallet } from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Pob } from '../../target/types/pob'
import { BankrunProvider } from 'anchor-bankrun'
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js'
import { startAnchor } from 'solana-bankrun'
import {
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { loadWallet, POB_PROGRAM_ID, BLOBER_PROGRAM_ID } from '../../sdk/utils'

// Cached provider - only initialized once
let pobProvider: BankrunProvider | null = null

// Shared mock state for all PoB tests
export const pobMock = {
  prover: null as Keypair | null,
  challenger: null as Keypair | null,
  daPayer: null as Keypair | null,
  wallet: null as Wallet | null,
  program: null as Program<Pob> | null,
  stakeMint: null as Keypair | null,
  proverAta: null as PublicKey | null,
  challengerAta: null as PublicKey | null,
}

/**
 * Get or create the shared PoB provider.
 * This function ensures startAnchor() is only called once.
 */
export async function getPobProvider(): Promise<BankrunProvider> {
  if (pobProvider) return pobProvider

  // Load wallet
  const wallet = loadWallet()
  pobMock.wallet = wallet

  // Generate test accounts
  pobMock.prover = Keypair.generate()
  pobMock.challenger = Keypair.generate()
  pobMock.daPayer = Keypair.generate()
  pobMock.stakeMint = Keypair.generate()

  // Create accounts with funding for startAnchor
  const fundedAccounts = [
    {
      address: wallet.publicKey,
      info: {
        lamports: 100 * 1e9, // 100 SOL for the main wallet
        owner: SystemProgram.programId,
        executable: false,
        data: Buffer.alloc(0),
      },
    },
    ...[pobMock.prover, pobMock.challenger, pobMock.daPayer].map((kp) => ({
      address: kp.publicKey,
      info: {
        lamports: 50 * 1e9, // 50 SOL (enough for rent + gas)
        owner: SystemProgram.programId,
        executable: false,
        data: Buffer.alloc(0),
      },
    })),
  ]

  // Create a single shared provider for all PoB tests
  const context = await startAnchor(
    '.',
    [
      { name: 'pob', programId: POB_PROGRAM_ID },
      { name: 'blober', programId: BLOBER_PROGRAM_ID },
    ],
    fundedAccounts,
  )
  pobProvider = new BankrunProvider(context)
  pobProvider.wallet = wallet
  anchor.setProvider(pobProvider)

  // Get program
  pobMock.program = anchor.workspace.POB as Program<Pob>

  // Setup stake token mint and ATAs
  await setupStakeToken(pobProvider, wallet)

  return pobProvider
}

/**
 * Setup the stake token mint and associated token accounts for testing.
 */
async function setupStakeToken(provider: BankrunProvider, wallet: Wallet) {
  const stakeMint = pobMock.stakeMint!
  const prover = pobMock.prover!
  const challenger = pobMock.challenger!

  // Calculate rent exemption for mint
  const rentExemptMint =
    await provider.connection.getMinimumBalanceForRentExemption(MINT_SIZE)

  // Create mint account
  const createMintAccountIx = SystemProgram.createAccount({
    fromPubkey: wallet.publicKey,
    newAccountPubkey: stakeMint.publicKey,
    space: MINT_SIZE,
    lamports: rentExemptMint,
    programId: TOKEN_PROGRAM_ID,
  })

  // Initialize mint (6 decimals like USDC)
  const initMintIx = createInitializeMintInstruction(
    stakeMint.publicKey,
    6, // 6 decimals
    wallet.publicKey, // mint authority
    null, // freeze authority
  )

  // Derive ATAs
  const proverAta = getAssociatedTokenAddressSync(
    stakeMint.publicKey,
    prover.publicKey,
  )
  const challengerAta = getAssociatedTokenAddressSync(
    stakeMint.publicKey,
    challenger.publicKey,
  )
  pobMock.proverAta = proverAta
  pobMock.challengerAta = challengerAta

  // Create ATAs
  const createProverAtaIx = createAssociatedTokenAccountInstruction(
    wallet.publicKey,
    proverAta,
    prover.publicKey,
    stakeMint.publicKey,
  )

  const createChallengerAtaIx = createAssociatedTokenAccountInstruction(
    wallet.publicKey,
    challengerAta,
    challenger.publicKey,
    stakeMint.publicKey,
  )

  // Mint tokens to provers/challengers (mint enough for staking)
  // 100_000_000_000 tokens with 6 decimals = 100,000 tokens
  const mintAmount = 100_000_000_000n

  const mintToProverIx = createMintToInstruction(
    stakeMint.publicKey,
    proverAta,
    wallet.publicKey,
    mintAmount,
  )

  const mintToChallengerIx = createMintToInstruction(
    stakeMint.publicKey,
    challengerAta,
    wallet.publicKey,
    mintAmount,
  )

  // Execute all setup transactions
  const tx = new anchor.web3.Transaction()
  tx.add(
    createMintAccountIx,
    initMintIx,
    createProverAtaIx,
    createChallengerAtaIx,
    mintToProverIx,
    mintToChallengerIx,
  )

  await provider.sendAndConfirm(tx, [wallet.payer, stakeMint])
}
