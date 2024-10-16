import * as anchor from '@coral-xyz/anchor'
import { execSync } from 'child_process'
import { BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey, SystemProgram } from '@solana/web3.js'
import {
  getRaydiumProgram,
  OPERATION_SEED,
  POSITION_SEED,
  SIX_DECIMALS,
  TICK_ARRAY_SEED,
} from '.'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'
import {
  Metadata,
  MPL_TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata'

export async function openPosition(
  provider: anchor.AnchorProvider,
  payer: anchor.web3.Keypair,
  raydium: PublicKey,
  pool: PublicKey,
  mint0: PublicKey,
  mint1: PublicKey,
) {
  // Step 1: Define local default variables
  const liquidity = new BN(1_000_000).mul(SIX_DECIMALS) // Liquidity as BN
  const amount0Max = new BN(500_000).mul(SIX_DECIMALS) // Max amount for token 0
  const amount1Max = new BN(300_000).mul(SIX_DECIMALS) // Max amount for token 1
  const tickLowerIndex = -10 // Default lower tick index
  const tickUpperIndex = 10 // Default upper tick index
  const tickArrayLowerStartIndex = 0 // Default lower tick array start index
  const tickArrayUpperStartIndex = 0 // Default upper tick array start index
  const withMetadata = true // Whether metadata is involved

  // Step 2: Generate NFT Mint and ATA (Associated Token Account)
  const nftMintKey = Keypair.generate() // New NFT mint key
  const nftToOwner = payer.publicKey // NFT to owner, defaulted to payer for now

  const [nftAtaTokenAccount] = PublicKey.findProgramAddressSync(
    [
      nftToOwner.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      nftMintKey.publicKey.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )

  // Step 3: Derive Metadata Account (for NFT)
  const [metadataAccountKey] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      Metadata.programId.toBuffer(),
      nftMintKey.publicKey.toBuffer(),
    ],
    Metadata.programId,
  )

  // Step 4: Derive Protocol Position PDA
  const [protocolPositionKey] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(POSITION_SEED),
      pool.toBuffer(),
      new BN(tickLowerIndex).toArrayLike(Buffer, 'be', 4),
      new BN(tickUpperIndex).toArrayLike(Buffer, 'be', 4),
    ],
    raydium,
  )

  // Step 5: Derive Tick Array Lower PDA
  const [tickArrayLower] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(TICK_ARRAY_SEED),
      pool.toBuffer(),
      new BN(tickArrayLowerStartIndex).toArrayLike(Buffer, 'be', 4),
    ],
    raydium,
  )

  // Step 6: Derive Tick Array Upper PDA
  const [tickArrayUpper] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(TICK_ARRAY_SEED),
      pool.toBuffer(),
      new BN(tickArrayUpperStartIndex).toArrayLike(Buffer, 'be', 4),
    ],
    raydium,
  )

  // Step 7: Derive Personal Position PDA
  const [personalPositionKey] = PublicKey.findProgramAddressSync(
    [Buffer.from(POSITION_SEED), nftMintKey.publicKey.toBuffer()],
    raydium,
  )

  // Step 8: Derive Token Accounts (if not provided)
  const [userTokenAccount0] = PublicKey.findProgramAddressSync(
    [payer.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint0.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )

  const [userTokenAccount1] = PublicKey.findProgramAddressSync(
    [payer.publicKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint1.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )

  // Step 9: Prepare and send transaction to open position
  await program.methods
    .openPositionV2(
      liquidity, // Liquidity amount in u128
      amount0Max, // Max amount for token 0
      amount1Max, // Max amount for token 1
      tickLowerIndex, // Lower tick index
      tickUpperIndex, // Upper tick index
      tickArrayLowerStartIndex, // Lower tick array start index
      tickArrayUpperStartIndex, // Upper tick array start index
      withMetadata, // Whether metadata is involved
      null, // No base flag
    )
    .accounts({
      payer: payer.publicKey, // Transaction payer
      positionNftOwner: nftToOwner, // NFT owner
      positionNftMint: nftMintKey.publicKey, // NFT mint key
      positionNftAccount: nftAtaTokenAccount, // NFT associated token account
      metadataAccount: metadataAccountKey, // Metadata account key
      poolState: pool, // Pool state account
      protocolPosition: protocolPositionKey, // Protocol position PDA
      tickArrayLower, // Lower tick array PDA
      tickArrayUpper, // Upper tick array PDA
      personalPosition: personalPositionKey, // Personal position PDA
      tokenAccount0: userTokenAccount0, // User's token account for token 0
      tokenAccount1: userTokenAccount1, // User's token account for token 1
      tokenVault0: mint0, // Token vault for token 0 (mint0)
      tokenVault1: mint1, // Token vault for token 1 (mint1)
      rent: anchor.web3.SYSVAR_RENT_PUBKEY, // Rent sysvar account
      systemProgram: SystemProgram.programId, // System program
      tokenProgram: TOKEN_PROGRAM_ID, // SPL Token program
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, // Associated Token program
      metadataProgram: Metadata.programId, // Metaplex metadata program
      tokenProgram2022: TOKEN_PROGRAM_ID, // Token Program 2022
    })
    .signers([payer, nftMintKey])
    .rpc()

  console.log('Position opened successfully')
}
