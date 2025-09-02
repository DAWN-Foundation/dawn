const fs = require('fs')
import dotenv from 'dotenv'
dotenv.config()

import {
  AnchorProvider,
  BN,
  Program,
  setProvider,
  Wallet,
  web3,
} from '@coral-xyz/anchor'
import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionBlockhashCtor,
} from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import {
  COORD_DENOMINATOR,
  GenerateDevice,
  IpV4Bytes,
  IpV6Bytes,
  loadWallet,
  MacAddress,
  Mock,
  RawMock,
} from '../../sdk/utils'
import { BankrunProvider } from 'anchor-bankrun'
import { getAccount } from '@solana/spl-token'

const DEVNET_RPC_URL = process.env.DEVNET_RPC_URL

// parse command line arguments
// find value of the --flag
export function getFlag(flag: string): string | null {
  const flagIndex = process.argv.findIndex((arg) => arg === flag)
  if (flagIndex === -1) {
    return null
  }
  return process.argv[flagIndex + 1]
}

// check if the flag is present
export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

// helper function to get the mock config
export function getMock(): Mock {
  const isDevnet = hasFlag('--devnet')

  const configData = fs.readFileSync(
    isDevnet ? 'devnet.json' : 'testnet.json',
    'utf8',
  )
  const mock: RawMock = JSON.parse(configData)

  return {
    serviceProvider: Keypair.fromSecretKey(
      Uint8Array.from(mock.serviceProvider.secretKey.split(',').map(Number)),
    ),
    customer: Keypair.fromSecretKey(
      Uint8Array.from(mock.customer.secretKey.split(',').map(Number)),
    ),
    // mints
    usdcMint: new PublicKey(mock.usdcMint),
    dawnMint: new PublicKey(mock.dawnMint),
    // token accounts
    feePoolDawnAccount: new PublicKey(mock.feePoolDawnAccount),
    daoDawnAccount: new PublicKey(mock.daoDawnAccount),
    validatorDawnAccount: new PublicKey(mock.validatorDawnAccount),
    medallionDawnAccount: new PublicKey(mock.medallionDawnAccount),
    serviceProviderDawnAccount: new PublicKey(mock.serviceProviderDawnAccount),
    serviceProviderUsdcAccount: new PublicKey(mock.serviceProviderUsdcAccount),
    customerDawnAccount: new PublicKey(mock.customerDawnAccount),
    customerUsdcAccount: new PublicKey(mock.customerUsdcAccount),
    walletDawnAccount: new PublicKey(mock.walletDawnAccount),
    walletUsdcAccount: new PublicKey(mock.walletUsdcAccount),
    escrowDawnVault: new PublicKey(mock.escrowDawnVault),
    escrowUsdcVault: new PublicKey(mock.escrowUsdcVault),
    // raydium
    raydium: new PublicKey(mock.raydium),
    raydiumAuthority: new PublicKey(mock.raydiumAuthority),
    raydiumConfig: new PublicKey(mock.raydiumConfig),
    raydiumPool: new PublicKey(mock.raydiumPool),
    raydiumObservation: new PublicKey(mock.raydiumObservation),
    raydiumDawnVault: new PublicKey(mock.raydiumDawnVault),
    raydiumUsdcVault: new PublicKey(mock.raydiumUsdcVault),
    // config
    daoFee: new BN(mock.daoFee),
    validatorFee: new BN(mock.validatorFee),
    medallionFee: new BN(mock.medallionFee),
    // PDAs
    tokenConfigPda: new PublicKey(mock.tokenConfigPda),
    configPda: new PublicKey(mock.configPda),
    deviceModelPda: new PublicKey(mock.deviceModelPda),
    deviceL2ModelPda: new PublicKey(mock.deviceL2ModelPda),
    organizationPda: new PublicKey(mock.organizationPda),
    distributionDomainPda: new PublicKey(mock.distributionDomainPda),
    accessDomainPda: new PublicKey(mock.accessDomainPda),
    localDomainPda: new PublicKey(mock.localDomainPda),
    sitePda: new PublicKey(mock.sitePda),
    devicePda: new PublicKey(mock.devicePda),
    deviceL2Pda: new PublicKey(mock.deviceL2Pda),
    deviceLocationPda: new PublicKey(mock.deviceLocationPda),
    serviceAgreementPda: new PublicKey(mock.serviceAgreementPda),
    planPda: new PublicKey(mock.planPda),
    planBump: mock.planBump,
    // ip pool
    rootSubscriberIpBlockPda: new PublicKey(mock.rootSubscriberIpBlockPda),
    ipBlockPda: new PublicKey(mock.ipBlockPda),
    ipLeasePda: new PublicKey(mock.ipLeasePda),
    loopIpRegistryPda: new PublicKey(mock.loopIpRegistryPda),
    ptpIpRegistryPda: new PublicKey(mock.ptpIpRegistryPda),
    subscriberIpRegistryPda: new PublicKey(mock.subscriberIpRegistryPda),
    rootLoopbackIpBlockPda: new PublicKey(mock.rootLoopbackIpBlockPda),
    loopbackIpBlockPda: new PublicKey(mock.loopbackIpBlockPda),
    loopbackIpLeasePda: new PublicKey(mock.loopbackIpLeasePda),
    rootPtpIpBlockPda: new PublicKey(mock.rootPtpIpBlockPda),
    ptpIpBlockPda: new PublicKey(mock.ptpIpBlockPda),
    ptpIpLeasePda: new PublicKey(mock.ptpIpLeasePda),
    // site
    siteName: mock.siteName,
    // device
    deviceName: mock.deviceName,
    deviceType: JSON.parse(mock.deviceType),
    deviceManufacturer: mock.deviceManufacturer,
    deviceModel: mock.deviceModel,
    deviceLatitude: new BN(mock.deviceLatitude * COORD_DENOMINATOR),
    deviceLongitude: new BN(mock.deviceLongitude * COORD_DENOMINATOR),
    devicePlacement: mock.devicePlacement,
    deviceHeight: mock.deviceHeight,
    deviceMacAddress: mock.deviceMacAddress,
    localDomain: mock.localDomain,
    deviceTypeL2: JSON.parse(mock.deviceTypeL2),
    deviceManufacturerL2: mock.deviceManufacturerL2,
    deviceModelL2: mock.deviceModelL2,
    deviceNameL2: mock.deviceNameL2,
    // service agreement
    slaThreshold: new BN(mock.slaThreshold),
    slaPayoutRatio: new BN(mock.slaPayoutRatio),
    // plan
    planName: mock.planName,
    planPrice: new BN(mock.planPrice),
    planDuration: mock.planDuration,
    planSpeed: mock.planSpeed,
    planCapacity: new BN(mock.planCapacity),
    planAuthMethods: JSON.parse(mock.planAuthMethods),
    // subscription
    subscriptionPda: new PublicKey(mock.subscriptionPda),
    subscriptionBump: mock.subscriptionBump,
  }
}

// helper function to get the IDL
export function getIDL(): Dawn {
  const idlData = fs.readFileSync('target/idl/dawn.json', 'utf8')
  return JSON.parse(idlData)
}

export function getDawnProgram(
  provider: BankrunProvider | AnchorProvider,
): Program<Dawn> {
  const idl = getIDL()
  return new Program(idl, provider)
}

export async function connect(): Promise<{
  wallet: Wallet
  program: Program<Dawn>
  connection: Connection
}> {
  const isDevnet = hasFlag('--devnet')
  console.log({ isDevnet })

  const wallet = getWallet()
  console.log({ signer: wallet.payer.publicKey.toBase58() })

  const rpcUrl = isDevnet
    ? DEVNET_RPC_URL ?? 'https://api.devnet.solana.com'
    : 'http://127.0.0.1:8899'
  console.log({ rpcUrl })
  const connection = new Connection(rpcUrl)
  const provider = new AnchorProvider(connection, wallet, {})
  setProvider(provider)
  const program = getDawnProgram(provider)

  return { wallet, program, connection: provider.connection }
}

// helper function to get wallet from the config
function configWallet(accountName: 'customer' | 'serviceProvider'): Wallet {
  const mock = getMock()
  const secretKey = mock[accountName].secretKey
  return new Wallet(Keypair.fromSecretKey(Uint8Array.from(secretKey)))
}

// helper function to get the wallet based on the flag
export function getWallet(): Wallet {
  let wallet: Wallet

  if (hasFlag('--customer')) {
    wallet = configWallet('customer')
  } else if (hasFlag('--service-provider')) {
    wallet = configWallet('serviceProvider')
  } else {
    wallet = loadWallet()
  }

  return wallet
}

export async function submitTx(
  connection: Connection,
  wallet: Wallet,
  itx: web3.TransactionInstruction,
  logs: boolean = true,
  commitment: Commitment = 'finalized',
) {
  const latestBlockHash = await connection.getLatestBlockhash({
    commitment,
  })
  // console.log({ latestBlockHash })

  const tx = new Transaction({
    ...latestBlockHash,
    feePayer: wallet.payer.publicKey,
  } as TransactionBlockhashCtor).add(itx)

  const signed = await wallet.signTransaction(tx)

  let txSignature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: true,
  })

  logs && console.log({ txSignature })

  const confirmationResult = await connection.confirmTransaction(
    { signature: txSignature, ...latestBlockHash },
    commitment,
  )

  logs &&
    console.log(
      'confirmationResult',
      JSON.stringify(confirmationResult, null, 2),
    )

  if (confirmationResult.value.err) {
    throw new Error(JSON.stringify(confirmationResult.value.err))
  }

  return confirmationResult
}

export async function getBalance(
  connection: Connection,
  account: PublicKey,
): Promise<BN> {
  const balance = (await getAccount(connection, account)).amount.toString()
  return new BN(balance)
}

export function generateMacAddress(): MacAddress {
  const mac = '0xXX:0xXX:0xXX:0xXX:0xXX:0xXX'
    .replace(/X/g, () =>
      '0123456789ABCDEF'.charAt(Math.floor(Math.random() * 16)),
    )
    .split(':')
    .map((el) => parseInt(el, 16))

  return [mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]]
}

export function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export class DeviceGenerator {
  static rnd(): number {
    return Math.random() - 0.5
  }
  static lon(): number {
    return parseFloat((this.rnd() * 360).toFixed(6))
  }
  static lat(): number {
    return parseFloat((this.rnd() * 180).toFixed(6))
  }

  static coordInBBBOX(bbox: number[]): [number, number] {
    return [
      parseFloat((Math.random() * (bbox[2] - bbox[0]) + bbox[0]).toFixed(6)),
      parseFloat((Math.random() * (bbox[3] - bbox[1]) + bbox[1]).toFixed(6)),
    ]
  }
  static flatPosition(bbox: number[]): [number, number] {
    if (bbox) return this.coordInBBBOX(bbox)
    else return [this.lon(), this.lat()]
  }

  static flatPoint(coordinates?: [number, number]): [number, number] {
    return coordinates || [this.lon(), this.lat()]
  }

  static generate(count: number, bbox?: number[]): GenerateDevice[] {
    const devices = []

    for (let i = 0; i < count; i++) {
      const device = {
        coord: bbox
          ? this.flatPoint(this.flatPosition(bbox))
          : this.flatPoint(),
        mac: generateMacAddress(),
        height: getRandomInt(1, 20),
        name: deviceNames[getRandomInt(0, deviceNames.length - 1)],
        placement: [getRandomInt(0, 36000), getRandomInt(-9000, 9000)],
        localDomain: 'local-domain',
      }

      devices.push(device)
    }

    return devices
  }
}

export class IpV4Generator {
  static ipToDecimal(ip: string): number {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + +octet, 0) >>> 0
  }

  static decimalToIp(decimal: number): IpV4Bytes {
    return [
      (decimal >>> 24) & 255,
      (decimal >>> 16) & 255,
      (decimal >>> 8) & 255,
      decimal & 255,
    ]
  }

  static generateIPList(startIP: string, prefixLength: number): IpV4Bytes[] {
    const start = this.ipToDecimal(startIP)
    const totalAddresses = Math.pow(2, 32 - prefixLength)
    const ipList: IpV4Bytes[] = []

    for (let i = 0; i < totalAddresses; i++) {
      ipList.push(this.decimalToIp(start + i))
    }

    return ipList.slice(1, totalAddresses)
  }
}

export class IpV6Generator {
  static generateIPList(baseIP: string, prefixLength: number): IpV6Bytes[] {
    const totalAddresses = Math.pow(2, 128 - prefixLength) // Общее количество адресов
    const ipList: IpV6Bytes[] = []
    const baseParts = baseIP.split(':').map((part) => parseInt(part))

    for (let i = 0; i < totalAddresses; i++) {
      const newParts = [...baseParts]
      let carry = i

      for (let j = newParts.length - 1; j >= 0 && carry > 0; j--) {
        newParts[j] += carry
        if (newParts[j] > 0xffff) {
          newParts[j] -= 0x10000
          carry = 1
        } else {
          carry = 0
        }
      }

      ipList.push(newParts.map((part) => part))
    }

    return ipList.slice(1, totalAddresses)
  }
}

export const deviceNames = [
  'Quantum-Stream-Edge',
  'Cyber-Pulse-Hub',
  'Digital-Wave-Node',
  'Nexus-Cloud-Point',
  'Atomic-Link-Station',
  'Solar-Net-Bridge',
  'Hyper-Flow-Gateway',
  'Rapid-Data-Terminal',
  'Cosmic-Beam-Router',
  'Nano-Grid-Portal',
  'Echo-Force-Beacon',
  'Fusion-Core-Access',
  'Vector-Sync-Module',
  'Orbit-Flux-Center',
  'Spark-Matrix-Relay',
  'Global-Surge-Endpoint',
  'Neutron-Path-Connector',
  'Pixel-Stream-Junction',
  'Delta-Chain-Interface',
  'Apex-Pulse-Network',
]

export const planNames = [
  'SpeedSurge 100',
  'BlazeNet Ultra',
  'TurboStream Pro',
  'HyperLink Max',
  'WarpSpeed 500',
  'Lightning Fiber',
  'Infinity Connect',
  'NitroNet Plus',
  'Velocity Wave',
  'Quantum Surf',
  'RocketStream',
  'HyperFlow 1G',
  'PulseFiber X',
  'RapidLink Elite',
  'MachNet Prime',
  'StormFiber Ultra',
  'ZenoSpeed Pro',
  'NeonNet Infinity',
  'Eclipse Fiber',
  'ZenithStream',
]
