import { BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'

export interface Mock {
  dao: Keypair
  validatorPool: Keypair
  medallionPool: Keypair
  buildingOwner: Keypair
  tester: Keypair
  // mints
  usdcMint: PublicKey
  dawnMint: PublicKey
  // token accounts
  daoDawnAccount: PublicKey
  validatorDawnAccount: PublicKey
  medallionDawnAccount: PublicKey
  buildingOwnerUsdcAccount: PublicKey
  buildingOwnerDawnAccount: PublicKey
  testerUsdcAccount: PublicKey
  testerDawnAccount: PublicKey
  // raydium
  raydium: PublicKey
  raydiumAuthority: PublicKey
  raydiumConfig: PublicKey
  raydiumPool: PublicKey
  raydiumObservation: PublicKey
  dawnVault: PublicKey
  usdcVault: PublicKey
  // config
  daoFee: BN
  validatorFee: BN
  medallionFee: BN
  // plan
  configPda: PublicKey
}

interface RawKeypair {
  publicKey: string
  secretKey: string
}

export interface RawMock {
  dao: RawKeypair
  validatorPool: RawKeypair
  medallionPool: RawKeypair
  buildingOwner: RawKeypair
  tester: RawKeypair
  // mints
  usdcMint: string
  dawnMint: string
  // token accounts
  daoDawnAccount: string
  validatorDawnAccount: string
  medallionDawnAccount: string
  buildingOwnerUsdcAccount: string
  buildingOwnerDawnAccount: string
  testerUsdcAccount: string
  testerDawnAccount: string
  // raydium
  raydium: string
  raydiumAuthority: string
  raydiumConfig: string
  raydiumPool: string
  raydiumObservation: string
  dawnVault: string
  usdcVault: string
  // config
  daoFee: string
  validatorFee: string
  medallionFee: string
  // plan
  configPda: string
}
