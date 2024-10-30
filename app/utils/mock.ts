import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import { Keypair } from '@solana/web3.js'

import { Mock } from './types'
import { fund } from './helpers'
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token'
import { setupRaydium } from './raydium'

export let mock: Mock

// Setup the environment for tests and set the mock
// only run once in `initialize` test
export async function setup(
  provider: anchor.AnchorProvider,
  wallet: anchor.Wallet,
) {
  // Create DAWN DAO KeyPair
  console.log('Creating DAWN DAO KeyPair...')
  const dao = Keypair.generate()
  await fund(provider.connection, dao.publicKey, 1000)

  // Create Validator Pool KeyPair
  console.log('Creating Validator Pool KeyPair...')
  const validatorPool = Keypair.generate()
  await fund(provider.connection, validatorPool.publicKey, 1000)

  // Create Medallion Pool KeyPair
  console.log('Creating Medallion Pool KeyPair...')
  const medallionPool = Keypair.generate()
  await fund(provider.connection, medallionPool.publicKey, 1000)

  // Create Building Owner KeyPair
  console.log('Creating Building Owner KeyPair...')
  const buildingOwner = Keypair.generate()
  await fund(provider.connection, buildingOwner.publicKey, 1000)

  // Create Tester KeyPair
  console.log('Creating Tester KeyPair...')
  const tester = Keypair.generate()
  await fund(provider.connection, tester.publicKey, 1000)

  // Mint test USDC token
  console.log('Minting test USDC token...')
  const usdcMint = await createMint(
    provider.connection,
    wallet.payer, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for USDC)
  )
  // Mint test DAWN token
  console.log('Minting test DAWN token...')
  const dawnMint = await createMint(
    provider.connection,
    wallet.payer, // Payer for transaction
    wallet.publicKey, // Mint authority
    null, // Freeze authority
    6, // Decimals (6 decimals for DAWN)
  )

  console.log({
    usdc_mint: usdcMint.toBase58(),
    dawn_mint: dawnMint.toBase58(),
  })

  // Create DAWN account for DAWN DAO
  console.log('Creating DAWN account for DAWN DAO...')
  const { address: daoDawnAccount } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    dao,
    dawnMint,
    dao.publicKey,
  )

  // Create DAWN account for Validator Pool
  console.log('Creating DAWN account for Validator Pool...')
  const { address: validatorDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      validatorPool,
      dawnMint,
      validatorPool.publicKey,
    )

  // Create DAWN account for Medallion Pool
  console.log('Creating DAWN account for Medallion Pool...')
  const { address: medallionDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      medallionPool,
      dawnMint,
      medallionPool.publicKey,
    )

  // Create DAWN account for Building Owner
  console.log('Creating DAWN account for Building Owner...')
  const { address: buildingOwnerDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      buildingOwner,
      dawnMint,
      buildingOwner.publicKey,
    )

  // Create USDC account for Building Owner
  console.log('Creating USDC account for Building Owner...')
  const { address: buildingOwnerUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      buildingOwner,
      usdcMint,
      buildingOwner.publicKey,
    )

  // Create USDC account for Tester
  console.log('Creating USDC account for Tester...')
  const { address: testerUsdcAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      tester,
      usdcMint,
      tester.publicKey,
    )

  // Create DAWN token account for Tester
  console.log('Creating DAWN token account for Tester...')
  const { address: testerDawnAccount } =
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      tester,
      dawnMint,
      tester.publicKey,
    )

  // Create DAWN token account for wallet.payer
  console.log('Creating DAWN token account for wallet.payer...')
  const { address: userDawnAccount } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    dawnMint,
    wallet.payer.publicKey,
  )

  // Create USDC token account for wallet.payer
  console.log('Creating USDC token account for wallet.payer...')
  const { address: userUsdcAccount } = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    usdcMint,
    wallet.payer.publicKey,
  )

  // Mint 1_000_000 USDC to user
  console.log('Minting 1_000_000 USDC to wallet.payer...')
  await mintTo(
    provider.connection,
    wallet.payer,
    usdcMint,
    userUsdcAccount,
    wallet.payer,
    BigInt(1_000_000_000_000), // 6 decimals
  )

  // Mint 1_000_000 DAWN to user
  console.log('Minting 1_000_000 DAWN to wallet.payer...')
  await mintTo(
    provider.connection,
    wallet.payer,
    dawnMint,
    userDawnAccount,
    wallet.payer,
    BigInt(1_000_000_000_000), // 6 decimals
  )
  // BigInt(1_000_000_000_000_000), // 9 decimals

  const { raydium, config, pool, auth, obs, dawnVault, usdcVault } =
    await setupRaydium(
      provider,
      wallet,
      dawnMint,
      usdcMint,
      userDawnAccount,
      userUsdcAccount,
    )

  // await new Promise((resolve) => setTimeout(resolve, 120_000))

  const daoFee = new BN(300) // 3% fee (dao_fee)
  const validatorFee = new BN(300) // 3% fee (validator_fee)
  const medallionFee = new BN(900) // 9% fee (medallion_fee)

  mock = {
    dao,
    validatorPool,
    medallionPool,
    buildingOwner,
    tester,
    // mints
    usdcMint,
    dawnMint,
    // token accounts
    daoDawnAccount,
    validatorDawnAccount,
    medallionDawnAccount,
    buildingOwnerDawnAccount,
    buildingOwnerUsdcAccount,
    testerUsdcAccount,
    testerDawnAccount,
    // raydium
    raydium,
    raydiumConfig: config,
    raydiumAuthority: auth,
    raydiumPool: pool,
    raydiumObservation: obs,
    dawnVault,
    usdcVault,
    // config
    daoFee,
    validatorFee,
    medallionFee,
  }
}
