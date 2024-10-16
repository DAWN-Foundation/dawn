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
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token'

const METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
)

export async function openPosition(
  provider: anchor.AnchorProvider,
  payer: anchor.web3.Keypair,
  raydium: PublicKey,
  pool: PublicKey,
  mint0: PublicKey,
  mint1: PublicKey,
) {
  const program = getRaydiumProgram(provider)

  // find the pool
  const poolAcc = await provider.connection.getParsedAccountInfo(pool)
  if (!poolAcc) {
    throw new Error('Pool not found')
  }
  console.log(poolAcc)

  // Step 1: Define local default variables
  const liquidity = 1_000_000 // Liquidity as BN
  const amount0Max = 500_000 // Max amount for token 0
  const amount1Max = 500_000 // Max amount for token 1
  const tickLowerIndex = 1 // Default lower tick index
  const tickUpperIndex = 10 // Default upper tick index
  const tickArrayLowerStartIndex = 0 // Default lower tick array start index
  const tickArrayUpperStartIndex = 0 // Default upper tick array start index
  const withMetadata = true // Whether metadata is involved
  const baseFlag = false // No base flag

  // Step 2: Generate NFT Mint and ATA (Associated Token Account)
  const nftMintKey = Keypair.generate() // New NFT mint key
  const nftToOwner = payer.publicKey // NFT to owner, defaulted to payer for now

  console.log({
    nftMintKey: nftMintKey,
    nftToOwner: nftToOwner.toBase58(),
  })

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
      METADATA_PROGRAM_ID.toBuffer(),
      nftMintKey.publicKey.toBuffer(),
    ],
    METADATA_PROGRAM_ID,
  )

  const tickLowerIndexBuffer = Buffer.alloc(4)
  tickLowerIndexBuffer.writeInt32BE(tickLowerIndex)

  const tickUpperIndexBuffer = Buffer.alloc(4)
  tickUpperIndexBuffer.writeInt32BE(tickUpperIndex)

  const tickArrayLowerStartIndexBuffer = Buffer.alloc(4)
  tickArrayLowerStartIndexBuffer.writeInt32BE(tickArrayLowerStartIndex)

  const tickArrayUpperStartIndexBuffer = Buffer.alloc(4)
  tickArrayUpperStartIndexBuffer.writeInt32BE(tickArrayUpperStartIndex)

  // Step 4: Derive Protocol Position PDA
  const [protocolPositionKey] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(POSITION_SEED),
      pool.toBuffer(),
      tickLowerIndexBuffer,
      tickUpperIndexBuffer,
    ],
    raydium,
  )

  console.log({
    protocolPositionKey: protocolPositionKey.toBase58(),
  })

  // Step 5: Derive Tick Array Lower PDA
  const [tickArrayLower] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(TICK_ARRAY_SEED),
      pool.toBuffer(),
      tickArrayLowerStartIndexBuffer,
    ],
    raydium,
  )

  // Step 6: Derive Tick Array Upper PDA
  const [tickArrayUpper] = PublicKey.findProgramAddressSync(
    [
      Buffer.from(TICK_ARRAY_SEED),
      pool.toBuffer(),
      tickArrayUpperStartIndexBuffer,
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

  const { address: tokenVault0 } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    mint0,
    payer.publicKey,
  )

  const { address: tokenVault1 } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    payer,
    mint1,
    payer.publicKey,
  )

  console.log({ tokenVault0, tokenVault1 })

  // Step 9: Prepare and send transaction to open position
  await program.methods
    .openPositionV2(
      new BN(liquidity), // Liquidity amount in u128
      new BN(amount0Max), // Max amount for token 0
      new BN(amount1Max), // Max amount for token 1
      new BN(tickLowerIndex), // Lower tick index
      new BN(tickUpperIndex), // Upper tick index
      new BN(tickArrayLowerStartIndex), // Lower tick array start index
      new BN(tickArrayUpperStartIndex), // Upper tick array start index
      withMetadata, // Whether metadata is involved
      baseFlag, // No base flag
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
      tokenVault0: tokenVault0, // Token vault for token 0 (mint0)
      tokenVault1: tokenVault1, // Token vault for token 1 (mint1)
      vault0Mint: mint0,
      vault1Mint: mint1,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY, // Rent sysvar account
      systemProgram: SystemProgram.programId, // System program
      tokenProgram: TOKEN_PROGRAM_ID, // SPL Token program
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, // Associated Token program
      metadataProgram: METADATA_PROGRAM_ID, // Metaplex metadata program
      tokenProgram2022: TOKEN_2022_PROGRAM_ID, // Token Program 2022
    })
    .signers([payer, nftMintKey])
    .rpc()

  console.log('Position opened successfully')
}
