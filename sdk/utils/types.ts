import { BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey } from '@solana/web3.js'

import {
  AuthMethodType,
  DeviceType,
  IpV4Bytes,
  IpV6Bytes,
  MacAddress,
} from './helpers'

export interface Mock {
  serviceProvider: Keypair
  customer: Keypair
  // mints
  usdcMint: PublicKey
  dawnMint: PublicKey
  // token accounts
  feePoolDawnAccount: PublicKey
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
  deviceL2ModelPda: PublicKey
  organizationPda: PublicKey
  distributionDomainPda: PublicKey
  accessDomainPda: PublicKey
  localDomainPda: PublicKey
  sitePda: PublicKey
  devicePda: PublicKey
  deviceL2Pda: PublicKey
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
  deviceName: string
  deviceMacAddress: MacAddress
  deviceLatitude: BN
  deviceLongitude: BN
  devicePlacement: [number, number]
  deviceHeight: number
  localDomain: string
  deviceTypeL2: DeviceType
  deviceManufacturerL2: string
  deviceModelL2: string
  deviceNameL2: string
  // service agreement
  slaThreshold: BN
  slaPayoutRatio: BN
  // plan
  planName: string
  planPrice: BN
  planDuration: number
  planSpeed: number
  planCapacity: BN
  planAuthMethods: PublicKey[]
  // subscription
  subscriptionPda: PublicKey
  subscriptionBump: number
}

interface RawKeypair {
  publicKey: string
  secretKey: string
}

export interface RawMock {
  serviceProvider: RawKeypair
  customer: RawKeypair
  // mints
  usdcMint: string
  dawnMint: string
  // token accounts
  feePoolDawnAccount: string
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
  deviceL2ModelPda: string
  organizationPda: string
  distributionDomainPda: string
  accessDomainPda: string
  localDomainPda: string
  sitePda: string
  devicePda: string
  deviceL2Pda: string
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
  deviceType: string
  deviceManufacturer: string
  deviceModel: string
  deviceName: string
  deviceLatitude: number
  deviceLongitude: number
  devicePlacement: [number, number]
  deviceHeight: number
  deviceMacAddress: MacAddress
  localDomain: string
  deviceTypeL2: string
  deviceManufacturerL2: string
  deviceModelL2: string
  deviceNameL2: string
  // service agreement
  slaThreshold: string
  slaPayoutRatio: string
  // plan
  planName: string
  planPrice: string
  planDuration: number
  planSpeed: number
  planCapacity: string
  planAuthMethods: string
  // subscription
  subscriptionPda: string
  subscriptionBump: number
}

// Authentication Types
export interface WiFiSecurityStandard {
  WPA2_PSK: number
  WPA3_PSK: number
}

export interface WiFiEncryption {
  AES_CCMP: number
  AES_GCMP: number
  AES_GCMP_256: number
}

export const WIFI_SECURITY_STANDARD: WiFiSecurityStandard = {
  WPA2_PSK: 0,
  WPA3_PSK: 1,
}

export const WIFI_ENCRYPTION: WiFiEncryption = {
  AES_CCMP: 0,
  AES_GCMP: 1,
  AES_GCMP_256: 2,
}

export interface PSKMethodParams {
  networkIdHash: number[]
  securityStandard: number
  encryptionAlgorithm: number
  pskRotationInterval: number
}

export interface PSKNetworkConfig {
  ssid: string
  securityStandard: keyof WiFiSecurityStandard
  encryptionAlgorithm: keyof WiFiEncryption
  pskRotationInterval?: number
}

export interface PSKCredentialData {
  pskHash: Buffer
  _reserved: Buffer
}
