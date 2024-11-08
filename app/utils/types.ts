import { BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'

export interface Mock {
  dao: Keypair
  validatorPool: Keypair
  medallionPool: Keypair
  provider: Keypair
  tester: Keypair
  // mints
  usdcMint: PublicKey
  dawnMint: PublicKey
  // token accounts
  daoDawnAccount: PublicKey
  validatorDawnAccount: PublicKey
  medallionDawnAccount: PublicKey
  providerUsdcAccount: PublicKey
  providerDawnAccount: PublicKey
  testerUsdcAccount: PublicKey
  testerDawnAccount: PublicKey
  // raydium
  raydium: PublicKey
  raydiumAuthority: PublicKey
  raydiumConfig: PublicKey
  raydiumPool: PublicKey
  raydiumObservation: PublicKey
  raydiumDawnVault: PublicKey
  raydiumUsdcVault: PublicKey
  // config
  daoFee: BN
  validatorFee: BN
  medallionFee: BN
  // PDAs
  configPda: PublicKey
  buildingPda: PublicKey
  // building
  buildingName: string
  buildingAddress: string
  buildingFloors: number
}

interface RawKeypair {
  publicKey: string
  secretKey: string
}

export interface RawMock {
  dao: RawKeypair
  validatorPool: RawKeypair
  medallionPool: RawKeypair
  provider: RawKeypair
  tester: RawKeypair
  // mints
  usdcMint: string
  dawnMint: string
  // token accounts
  daoDawnAccount: string
  validatorDawnAccount: string
  medallionDawnAccount: string
  providerUsdcAccount: string
  providerDawnAccount: string
  testerUsdcAccount: string
  testerDawnAccount: string
  escrowUsdcVault: string
  // raydium
  raydium: string
  raydiumAuthority: string
  raydiumConfig: string
  raydiumPool: string
  raydiumObservation: string
  raydiumDawnVault: string
  raydiumUsdcVault: string
  // config
  daoFee: string
  validatorFee: string
  medallionFee: string
  // PDAs
  configPda: string
  buildingPda: string
  // building
  buildingName: string
  buildingAddress: string
  buildingFloors: number
}
