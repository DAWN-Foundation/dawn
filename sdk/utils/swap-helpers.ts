import { BN, Program } from '@coral-xyz/anchor'
import { Connection, PublicKey } from '@solana/web3.js'
import { getAccount } from '@solana/spl-token'

const Q32 = new BN('4294967296') // 2^32

/**
 * Calculate minimum DAWN output with MEV protection
 * @param connection - Solana connection
 * @param raydiumPoolPda - Raydium pool address
 * @param raydiumConfigPda - Raydium config address (to fetch trade fee)
 * @param raydiumDawnVault - DAWN vault address
 * @param raydiumUsdcVault - USDC vault address
 * @param usdcAmountIn - Amount of USDC to swap
 * @param slippageBps - Slippage tolerance in basis points (default 100 = 1%)
 * @returns Object containing minDawnOut and deadline
 */
export async function calculateSwapBounds(
  connection: Connection,
  raydiumPoolPda: PublicKey,
  raydiumConfigPda: PublicKey,
  raydiumDawnVault: PublicKey,
  raydiumUsdcVault: PublicKey,
  usdcAmountIn: BN,
  slippageBps: number = 100,
): Promise<{ minDawnOut: BN; deadline: BN }> {
  // Fetch pool account to get pool state
  const poolAccount = await connection.getAccountInfo(raydiumPoolPda)
  if (!poolAccount) {
    throw new Error('Pool account not found')
  }

  // Decode pool state to get vault ordering
  // PoolState structure (from Raydium CP Swap):
  //   discriminator: 8 bytes (0-7)
  //   amm_config: Pubkey (8-39)
  //   pool_creator: Pubkey (40-71)
  //   token_0_vault: Pubkey (72-103) ← what we need
  //   token_1_vault: Pubkey (104-135) ← what we need
  //   ...
  const token0VaultOffset = 72
  const token1VaultOffset = 104

  const token0Vault = new PublicKey(
    poolAccount.data.slice(token0VaultOffset, token0VaultOffset + 32),
  )
  const token1Vault = new PublicKey(
    poolAccount.data.slice(token1VaultOffset, token1VaultOffset + 32),
  )

  // Fetch vault balances
  const dawnVault = await getAccount(connection, raydiumDawnVault)
  const usdcVault = await getAccount(connection, raydiumUsdcVault)

  const dawnReserve = new BN(dawnVault.amount.toString())
  const usdcReserve = new BN(usdcVault.amount.toString())

  // Sort vaults the same way the Rust program does
  // If DAWN vault is token_0, then (vault_0_amount, vault_1_amount) = (dawn, usdc)
  // Otherwise (vault_0_amount, vault_1_amount) = (usdc, dawn)
  const isDawnToken0 = raydiumDawnVault.equals(token0Vault)
  const vault0Amount = isDawnToken0 ? dawnReserve : usdcReserve
  const vault1Amount = isDawnToken0 ? usdcReserve : dawnReserve

  // Calculate price using Raydium's token_price_x32 formula
  // token_0_price = (vault_1_amount << 32) / vault_0_amount
  // token_1_price = (vault_0_amount << 32) / vault_1_amount
  const token0PriceX32 = vault1Amount.shln(32).div(vault0Amount)
  const token1PriceX32 = vault0Amount.shln(32).div(vault1Amount)

  // Determine if USDC is base (token_0) or quote (token_1)
  const isUsdcBase = raydiumUsdcVault.equals(token0Vault)

  // Select the appropriate price based on vault ordering
  // We're swapping USDC -> DAWN, so we need the price that converts USDC to DAWN
  const price = isUsdcBase ? token0PriceX32 : token1PriceX32

  // Calculate expected DAWN output: (usdcAmountIn * price) / 2^32
  const expectedDawnOut = usdcAmountIn.mul(price).div(Q32)

  // Apply slippage tolerance
  // minDawnOut = expectedOut * (10000 - slippageBps) / 10000
  const minDawnOut = expectedDawnOut
    .mul(new BN(10000 - slippageBps))
    .div(new BN(10000))

  // Set deadline to 30 seconds from now
  const deadline = new BN(Math.floor(Date.now() / 1000) + 30)

  return { minDawnOut, deadline }
}

/**
 * Get deadline timestamp (current time + offset in seconds)
 * @param offsetSeconds - Number of seconds from now (default 30)
 * @returns Deadline as BN timestamp
 */
export function getDeadline(offsetSeconds: number = 30): BN {
  return new BN(Math.floor(Date.now() / 1000) + offsetSeconds)
}
