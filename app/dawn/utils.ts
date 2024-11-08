const fs = require('fs')
import * as anchor from '@coral-xyz/anchor'
import { BN } from '@coral-xyz/anchor'
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionBlockhashCtor,
} from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import { loadWallet, Mock, RawMock } from '../utils'
import { BankrunProvider, startAnchor } from 'anchor-bankrun'

const PROGRAM_ID = new PublicKey('BNf8E3y61JVMzm65Va5rzacyec8axAx86YvvjZwBvx6S')

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
    provider: Keypair.fromSecretKey(
      Uint8Array.from(mock.provider.secretKey.split(',').map(Number)),
    ),
    tester: Keypair.fromSecretKey(
      Uint8Array.from(mock.tester.secretKey.split(',').map(Number)),
    ),
    // mints
    usdcMint: new PublicKey(mock.usdcMint),
    dawnMint: new PublicKey(mock.dawnMint),
    // token accounts
    daoDawnAccount: new PublicKey(mock.daoDawnAccount),
    validatorDawnAccount: new PublicKey(mock.validatorDawnAccount),
    medallionDawnAccount: new PublicKey(mock.medallionDawnAccount),
    providerUsdcAccount: new PublicKey(mock.providerUsdcAccount),
    providerDawnAccount: new PublicKey(mock.providerDawnAccount),
    testerUsdcAccount: new PublicKey(mock.testerUsdcAccount),
    testerDawnAccount: new PublicKey(mock.testerDawnAccount),
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
    buildingPda: new PublicKey(mock.buildingPda),
    // building
    buildingName: mock.buildingName,
    buildingAddress: mock.buildingAddress,
    buildingFloors: mock.buildingFloors,
  }
}

// helper function to get the IDL
export function getIDL(): Dawn {
  const idlData = fs.readFileSync('target/idl/dawn.json', 'utf8')
  return JSON.parse(idlData)
}

export function getDawnProgram(
  provider: BankrunProvider,
): anchor.Program<Dawn> {
  const idl = getIDL()
  return new anchor.Program<Dawn>(idl as Dawn, PROGRAM_ID, provider)
}

export async function connect(): Promise<{
  wallet: anchor.Wallet
  program: anchor.Program<Dawn>
  connection: Connection
}> {
  const wallet = getWallet()
  console.log({ signer: wallet.payer.publicKey.toBase58() })
  const context = await startAnchor('.', [], [])
  const provider = new BankrunProvider(context)
  anchor.setProvider(provider)
  const program = getDawnProgram(provider)

  return { wallet, program, connection: provider.connection }
}

// helper function to get wallet from the config
function configWallet(accountName: 'tester' | 'buildingOwner'): anchor.Wallet {
  const mock = getMock()
  const secretKey = mock[accountName].secretKey
  return new anchor.Wallet(Keypair.fromSecretKey(Uint8Array.from(secretKey)))
}

// helper function to get the wallet based on the flag
export function getWallet(): anchor.Wallet {
  let wallet: anchor.Wallet

  if (hasFlag('--tester')) {
    wallet = configWallet('tester')
  } else if (hasFlag('--building-owner')) {
    wallet = configWallet('buildingOwner')
  } else {
    wallet = loadWallet()
  }

  return wallet
}

export async function submitTx(
  connection: Connection,
  wallet: anchor.Wallet,
  itx: anchor.web3.TransactionInstruction,
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
    txSignature,
    'confirmed',
  )

  console.log('confirmationResult', confirmationResult)

  if (confirmationResult.value.err) {
    throw new Error(JSON.stringify(confirmationResult.value.err))
  }

  return confirmationResult
}

// Helper function to get the PDA for a plan given plan parameters
export function getPlanPda(
  program: anchor.Program<Dawn>,
  building: PublicKey,
  price: BN,
  duration: number,
  speed: number,
  capacity: BN,
  slaId: BN,
): [PublicKey, number] {
  const durationBuffer = Buffer.alloc(2) // 2 bytes for a 16-bit integer
  durationBuffer.writeUInt16LE(duration)

  const speedBuffer = Buffer.alloc(4) // 4 bytes for a 32-bit integer
  speedBuffer.writeUInt32LE(speed)

  const [planPda, planBump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('plan'),
      Buffer.from(building.toBytes()),
      Buffer.from(price.toArray('le', 8)),
      durationBuffer,
      speedBuffer,
      Buffer.from(capacity.toArray('le', 8)),
      Buffer.from(slaId.toArray('le', 8)),
    ],
    program.programId,
  )

  return [planPda, planBump]
}
