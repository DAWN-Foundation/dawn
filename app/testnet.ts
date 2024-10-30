import fs from 'fs'
import { Connection, Keypair } from '@solana/web3.js'
import { loadWallet, fund, setup } from './utils'
import { AnchorProvider } from '@coral-xyz/anchor'

const { PublicKey } = require('@solana/web3.js')

async function main() {
  // Get Local Wallet KeyPair
  const wallet = loadWallet()

  // Connect to local node
  let connection = new Connection('http://127.0.0.1:8899')
  let provider = new AnchorProvider(connection, wallet, {})

  // Fund wallet
  await fund(provider.connection, wallet.publicKey, 500)

  // Setup accounts
  const accounts = await setup(provider, wallet, true)

  // Parse into readable format
  let parsed = {}
  Object.entries(accounts).forEach(([key, value]) => {
    parsed[key] =
      value instanceof Keypair
        ? {
            publicKey: value.publicKey.toBase58(),
            secretKey: value.secretKey.toString(),
          }
        : value instanceof PublicKey
        ? value.toBase58()
        : value.toString()
  })
  console.log(parsed)

  // Save to a file
  fs.writeFileSync('testnet.json', JSON.stringify(parsed, null, 2))
}

main().catch(console.error)
