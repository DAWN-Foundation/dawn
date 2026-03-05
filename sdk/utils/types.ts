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
  stableMint: PublicKey
  dawnMint: PublicKey
  // token accounts
  feePoolDawnAccount: PublicKey
  daoDawnAccount: PublicKey
  validatorDawnAccount: PublicKey
  medallionDawnAccount: PublicKey
  serviceProviderDawnAccount: PublicKey
  serviceProviderStableAccount: PublicKey
  customerDawnAccount: PublicKey
  customerStableAccount: PublicKey
  walletDawnAccount: PublicKey
  walletStableAccount: PublicKey
  escrowDawnVault: PublicKey
  escrowStableVault: PublicKey
  // raydium
  raydium: PublicKey
  raydiumAuthority: PublicKey
  raydiumConfig: PublicKey
  raydiumPool: PublicKey
  raydiumObservation: PublicKey
  raydiumDawnVault: PublicKey
  raydiumStableVault: PublicKey
  // config
  daoFee: BN
  validatorFee: BN
  medallionFee: BN
  // PDAs
  tokenConfigPda: PublicKey
  configPda: PublicKey
  // ipPoolPda: PublicKey§
  deviceModelPda: PublicKey
  deviceL2ModelPda: PublicKey
  distributionDomainPda: PublicKey
  accessDomainPda: PublicKey
  localDomainPda: PublicKey
  devicePda: PublicKey
  deviceL2Pda: PublicKey
  deviceLocationPda: PublicKey
  serviceAgreementPda: PublicKey
  planPda: PublicKey
  planBump: number
  // IPAM
  loopIpRegistryPda: PublicKey
  rootLoopbackIpBlockPda: PublicKey
  loopbackIpBlockPda: PublicKey
  loopbackIpLeasePda: PublicKey
  rootPtpIpBlockPda: PublicKey
  ptpIpRegistryPda: PublicKey
  ptpIpBlockPda: PublicKey
  ptpIpLeasePda: PublicKey
  rootSubscriberIpBlockPda: PublicKey
  ipBlockPda: PublicKey
  ipLeasePda: PublicKey
  subscriberIpRegistryPda: PublicKey
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
  stableMint: string
  dawnMint: string
  // token accounts
  feePoolDawnAccount: string
  daoDawnAccount: string
  validatorDawnAccount: string
  medallionDawnAccount: string
  serviceProviderDawnAccount: string
  serviceProviderStableAccount: string
  customerDawnAccount: string
  customerStableAccount: string
  walletDawnAccount: string
  walletStableAccount: string
  escrowDawnVault: string
  escrowStableVault: string
  // raydium
  raydium: string
  raydiumAuthority: string
  raydiumConfig: string
  raydiumPool: string
  raydiumObservation: string
  raydiumDawnVault: string
  raydiumStableVault: string
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
  distributionDomainPda: string
  accessDomainPda: string
  localDomainPda: string
  devicePda: string
  deviceL2Pda: string
  deviceLocationPda: string
  serviceAgreementPda: string
  planPda: string
  planBump: number
  // ip pool
  loopIpRegistryPda: string
  ptpIpRegistryPda: string
  subscriberIpRegistryPda: string
  rootSubscriberIpBlockPda: string
  ipBlockPda: string
  ipLeasePda: string
  rootLoopbackIpBlockPda: string
  loopbackIpBlockPda: string
  loopbackIpLeasePda: string
  rootPtpIpBlockPda: string
  ptpIpBlockPda: string
  ptpIpLeasePda: string
  // device
  deviceType: string
  deviceManufacturer: string
  deviceModel: string
  deviceName: string
  deviceLatitude: number
  deviceLongitude: number
  devicePlacement: string
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
