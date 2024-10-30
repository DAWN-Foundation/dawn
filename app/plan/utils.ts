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

import { Plan } from '../../target/types/plan'
import { Mock, RawMock } from '../utils'

const PROGRAM_ID = new PublicKey('7VuWWEAgNE1PbcgwSPjbXQ8BD5R8fHQE6L7fCzZ3x8Gc')

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
    buildingOwner: Keypair.fromSecretKey(
      Uint8Array.from(mock.buildingOwner.secretKey.split(',').map(Number)),
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
    buildingOwnerUsdcAccount: new PublicKey(mock.buildingOwnerUsdcAccount),
    buildingOwnerDawnAccount: new PublicKey(mock.buildingOwnerDawnAccount),
    testerUsdcAccount: new PublicKey(mock.testerUsdcAccount),
    testerDawnAccount: new PublicKey(mock.testerDawnAccount),
    // raydium
    raydium: new PublicKey(mock.raydium),
    raydiumAuthority: new PublicKey(mock.raydiumAuthority),
    raydiumConfig: new PublicKey(mock.raydiumConfig),
    raydiumPool: new PublicKey(mock.raydiumPool),
    raydiumObservation: new PublicKey(mock.raydiumObservation),
    dawnVault: new PublicKey(mock.dawnVault),
    usdcVault: new PublicKey(mock.usdcVault),
    // config
    daoFee: new BN(mock.daoFee),
    validatorFee: new BN(mock.validatorFee),
    medallionFee: new BN(mock.medallionFee),
    // plan
    configPda: new PublicKey(mock.configPda),
  }
}

// helper function to get the IDL
export function getIDL(): Plan {
  const idlData = fs.readFileSync('target/idl/plan.json', 'utf8')
  return JSON.parse(idlData)
}

export function getPlanProgram(
  provider: anchor.AnchorProvider,
): anchor.Program<Plan> {
  const idl = getIDL()
  return new anchor.Program<Plan>(idl as Plan, PROGRAM_ID, provider)
}

export async function connect(): Promise<{
  wallet: anchor.Wallet
  program: anchor.Program<Plan>
  connection: Connection
}> {
  const wallet = getWallet()
  console.log({ signer: wallet.payer.publicKey.toBase58() })
  const connection = new Connection('http://127.0.0.1:8899')
  const provider = new anchor.AnchorProvider(connection, wallet, {})
  anchor.setProvider(provider)
  const program = getPlanProgram(provider)

  return { wallet, program, connection }
}

// helper function to get wallet from the config
function configWallet(accountName: 'tester' | 'buildingOwner'): anchor.Wallet {
  const mock = getMock()
  const secretKey = mock[accountName].secretKey
  return new anchor.Wallet(Keypair.fromSecretKey(Uint8Array.from(secretKey)))
}

// helper function to load the wallet from the local file system
export function loadWallet(): anchor.Wallet {
  const walletPath = `${require('os').homedir()}/.config/solana/id.json`
  const secretKeyString = fs.readFileSync(walletPath, 'utf8')
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString))
  const keypair = Keypair.fromSecretKey(secretKey)
  return new anchor.Wallet(keypair)
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
  program: anchor.Program<Plan>,
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
