import { BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'

export interface Mock {
  dao: Keypair
  validatorPool: Keypair
  medallionPool: Keypair
  serviceProvider: Keypair
  customer: Keypair
  // mints
  usdcMint: PublicKey
  dawnMint: PublicKey
  // token accounts
  daoDawnAccount: PublicKey
  validatorDawnAccount: PublicKey
  medallionDawnAccount: PublicKey
  serviceProviderUsdcAccount: PublicKey
  serviceProviderDawnAccount: PublicKey
  customerUsdcAccount: PublicKey
  customerDawnAccount: PublicKey
  walletDawnAccount: PublicKey
  walletUsdcAccount: PublicKey
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
  planPda: PublicKey
  planBump: number
  // building
  buildingName: string
  buildingAddress: string
  buildingFloors: number
  // plan
  planPrice: BN
  planDuration: number
  planSpeed: number
  planCapacity: BN
  planSlaId: BN
  // subscription
  subscriptionPda: PublicKey
  subscriptionBump: number
}

interface RawKeypair {
  publicKey: string
  secretKey: string
}

export interface RawMock {
  dao: RawKeypair
  validatorPool: RawKeypair
  medallionPool: RawKeypair
  serviceProvider: RawKeypair
  customer: RawKeypair
  // mints
  usdcMint: string
  dawnMint: string
  // token accounts
  daoDawnAccount: string
  validatorDawnAccount: string
  medallionDawnAccount: string
  serviceProviderUsdcAccount: string
  serviceProviderDawnAccount: string
  customerUsdcAccount: string
  customerDawnAccount: string
  walletDawnAccount: string
  walletUsdcAccount: string
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
  planPda: string
  planBump: number
  // building
  buildingName: string
  buildingAddress: string
  buildingFloors: number
  // plan
  planPrice: string
  planDuration: number
  planSpeed: number
  planCapacity: string
  planSlaId: string
  // subscription
  subscriptionPda: string
  subscriptionBump: number
}
