import { BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'

import {
  AuthMethod,
  DeviceType,
  IpV4Bytes,
  IpV6Bytes,
  MacAddress,
} from './helpers'

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
  serviceProviderDawnAccount: PublicKey
  serviceProviderUsdcAccount: PublicKey
  customerDawnAccount: PublicKey
  customerUsdcAccount: PublicKey
  walletDawnAccount: PublicKey
  walletUsdcAccount: PublicKey
  escrowDawnVault: PublicKey
  escrowUsdcVault: PublicKey
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
  tokenConfigPda: PublicKey
  configPda: PublicKey
  ipPoolPda: PublicKey
  deviceModelPda: PublicKey
  accessDomainPda: PublicKey
  sitePda: PublicKey
  devicePda: PublicKey
  ipLeasePda: PublicKey
  deviceLocationPda: PublicKey
  serviceAgreementPda: PublicKey
  planPda: PublicKey
  planBump: number
  // ip pool
  poolIpV4: IpV4Bytes
  poolIpV4CidrMask: number
  poolIpV6: IpV6Bytes
  poolIpV6CidrMask: number
  leaseIpV4: IpV4Bytes
  leaseIpV4CidrMask: number
  leaseIpV6: IpV6Bytes
  leaseIpV6CidrMask: number
  // site
  siteName: string
  // device
  deviceType: DeviceType
  deviceManufacturer: string
  deviceModel: string
  deviceMacAddress: MacAddress
  deviceLatitude: BN
  deviceLongitude: BN
  deviceHeight: number
  // service agreement
  slaThreshold: BN
  slaPayoutRatio: BN
  // plan
  planPrice: BN
  planDuration: number
  planSpeed: number
  planCapacity: BN
  planAuthMethods: AuthMethod[]
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
  serviceProviderDawnAccount: string
  serviceProviderUsdcAccount: string
  customerDawnAccount: string
  customerUsdcAccount: string
  walletDawnAccount: string
  walletUsdcAccount: string
  escrowDawnVault: string
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
  tokenConfigPda: string
  configPda: string
  ipPoolPda: string
  deviceModelPda: string
  accessDomainPda: string
  sitePda: string
  devicePda: string
  ipLeasePda: string
  deviceLocationPda: string
  serviceAgreementPda: string
  planPda: string
  planBump: number
  // ip pool
  poolIpV4: IpV4Bytes
  poolIpV4CidrMask: number
  poolIpV6: IpV6Bytes
  poolIpV6CidrMask: number
  leaseIpV4: IpV4Bytes
  leaseIpV4CidrMask: number
  leaseIpV6: IpV6Bytes
  leaseIpV6CidrMask: number
  // site
  siteName: string
  // device
  deviceType: DeviceType
  deviceManufacturer: string
  deviceModel: string
  deviceLatitude: number
  deviceLongitude: number
  deviceHeight: number
  deviceMacAddress: MacAddress
  // service agreement
  slaThreshold: string
  slaPayoutRatio: string
  // plan
  planPrice: string
  planDuration: number
  planSpeed: number
  planCapacity: string
  planAuthMethods: AuthMethod[]
  // subscription
  subscriptionPda: string
  subscriptionBump: number
}
