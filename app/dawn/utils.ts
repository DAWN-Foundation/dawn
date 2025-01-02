const fs = require('fs')
import { AnchorProvider, BN, Program, setProvider, Wallet, web3 } from '@coral-xyz/anchor'
import {
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
  loadWallet,
  MacAddress,
  Mock,
  PROGRAM_ID,
  RawMock,
  getPlanPda,
} from '../utils'
import { BankrunProvider } from 'anchor-bankrun'
import { getAccount } from '@solana/spl-token'

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
  const configData = fs.readFileSync('testnet.json', 'utf8')
  const mock: RawMock = JSON.parse(configData)

  return {
    dao: Keypair.fromSecretKey(
      Uint8Array.from(mock.dao.secretKey.split(',').map(Number)),
    ),
    validatorPool: Keypair.fromSecretKey(
      Uint8Array.from(mock.validatorPool.secretKey.split(',').map(Number)),
    ),
    medallionPool: Keypair.fromSecretKey(
      Uint8Array.from(mock.medallionPool.secretKey.split(',').map(Number)),
    ),
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
    configPda: new PublicKey(mock.configPda),
    ipPoolPda: new PublicKey(mock.ipPoolPda),
    deviceModelPda: new PublicKey(mock.deviceModelPda),
    devicePda: new PublicKey(mock.devicePda),
    ipLeasePda: new PublicKey(mock.ipLeasePda),
    deviceLocationPda: new PublicKey(mock.deviceLocationPda),
    planPda: new PublicKey(mock.planPda),
    planBump: mock.planBump,
    // ip pool
    poolIpV4: mock.poolIpV4,
    poolIpV4CidrMask: mock.poolIpV4CidrMask,
    poolIpV6: mock.poolIpV6,
    poolIpV6CidrMask: mock.poolIpV6CidrMask,
    leaseIpV4: mock.leaseIpV4,
    leaseIpV4CidrMask: mock.leaseIpV4CidrMask,
    leaseIpV6: mock.leaseIpV6,
    leaseIpV6CidrMask: mock.leaseIpV6CidrMask,
    // device
    deviceType: mock.deviceType,
    deviceManufacturer: mock.deviceManufacturer,
    deviceModel: mock.deviceModel,
    deviceLatitude: new BN(mock.deviceLatitude * COORD_DENOMINATOR),
    deviceLongitude: new BN(mock.deviceLongitude * COORD_DENOMINATOR),
    deviceMacAddress: mock.deviceMacAddress,
    // plan
    planPrice: new BN(mock.planPrice),
    planDuration: mock.planDuration,
    planSpeed: mock.planSpeed,
    planCapacity: new BN(mock.planCapacity),
    planSlaId: new BN(mock.planSlaId),
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
  return new Program<Dawn>(idl as Dawn, PROGRAM_ID, provider)
}

export async function connect(): Promise<{
  wallet: Wallet
  program: Program<Dawn>
  connection: Connection
}> {
  const wallet = getWallet()
  console.log({ signer: wallet.payer.publicKey.toBase58() })

  const connection = new Connection('http://127.0.0.1:8899')
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
) {
  const latestBlockHash = await connection.getLatestBlockhash({
    commitment: 'confirmed',
  })

  const tx = new Transaction({
    ...latestBlockHash,
    feePayer: wallet.payer.publicKey,
  } as TransactionBlockhashCtor).add(itx)

  const signed = await wallet.signTransaction(tx)

  let txSignature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: true,
  })
  console.log({ txSignature })

  const confirmationResult = await connection.confirmTransaction(
    { signature: txSignature, ...latestBlockHash },
    'confirmed',
  )

  console.log('confirmationResult', confirmationResult)

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
  const mac = "0xXX:0xXX:0xXX:0xXX:0xXX:0xXX".replace(/X/g, () =>
    "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16))
  ).split(":").map(el => parseInt(el, 16))

  return [mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]]
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

  static genearate(count: number, bbox?: number[]): GenerateDevice[] {
    const devices = []

    for (let i = 0; i < count; i++) {
      const device = {
        coord: bbox ? this.flatPoint(this.flatPosition(bbox)) : this.flatPoint(),
        mac: generateMacAddress(),
      }

      devices.push(device)
    }

    return devices
  }
}