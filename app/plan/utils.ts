const fs = require('fs')
import * as anchor from '@coral-xyz/anchor'
import {
  Connection,
  Keypair,
  Transaction,
  TransactionBlockhashCtor,
} from '@solana/web3.js'

import { PlanInitConfig } from '../types'
import { Plan } from '../../target/types/plan'

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

// helper function to get the config
export function getConfig(): PlanInitConfig {
  const configData = fs.readFileSync('testnet.json', 'utf8')
  return JSON.parse(configData)
}

// helper function to get the IDL
export function getIDL(): Plan {
  const idlData = fs.readFileSync('target/idl/plan.json', 'utf8')
  return JSON.parse(idlData)
}

// helper function to get wallet from the config
function configWallet(
  accountName: 'root' | 'tester' | 'buildingOwner',
): anchor.Wallet {
  const config = getConfig()
  const secretKey = config[accountName].secretKey.split(',').map(Number)
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

  const confirmationResult = await connection.confirmTransaction(
    txSignature,
    'confirmed',
  )

  if (confirmationResult.value.err) {
    throw new Error(JSON.stringify(confirmationResult.value.err))
  }

  return confirmationResult
}
