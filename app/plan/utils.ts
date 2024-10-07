const fs = require('fs')
import * as anchor from '@coral-xyz/anchor'
import { Keypair } from '@solana/web3.js'

import { PlanInitConfig } from '../types'
import { Plan } from '../../target/types/plan'

export async function getConfig(): Promise<PlanInitConfig> {
  const configData = fs.readFileSync('testnet.json', 'utf8')
  return JSON.parse(configData)
}

export async function getIDL(): Promise<Plan> {
  const idlData = fs.readFileSync('target/idl/plan.json', 'utf8')
  return JSON.parse(idlData)
}

// Function to load the wallet from the local file system
export function loadWallet(): anchor.Wallet {
  const walletPath = `${require('os').homedir()}/.config/solana/id.json`
  const secretKeyString = fs.readFileSync(walletPath, 'utf8')
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString))
  const keypair = Keypair.fromSecretKey(secretKey)
  return new anchor.Wallet(keypair)
}
