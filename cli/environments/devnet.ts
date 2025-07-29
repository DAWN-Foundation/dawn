import fs from 'fs'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { loadWallet, createAccounts, prepare } from '../../sdk/utils'
import { AnchorProvider } from '@coral-xyz/anchor'

async function main() {
  console.log(
    'Preparing devnet, creating accounts, minting tokens... (this may take a while)',
  )

  // Get Local Wallet KeyPair
  const wallet = loadWallet()

  // Connect to local node
  let connection = new Connection('https://api.devnet.solana.com')
  let provider = new AnchorProvider(connection, wallet, {})

  // Setup accounts
  const accounts = await createAccounts()
  const mock = await prepare(provider, accounts, true)

  // Parse into readable format
  let parsed = {}
  Object.entries(mock).forEach(([key, value]) => {
    parsed[key] =
      value instanceof Keypair
        ? {
            publicKey: value.publicKey.toBase58(),
            secretKey: value.secretKey.toString(),
          }
        : value instanceof PublicKey
        ? value.toBase58()
        : ['deviceType', 'planAuthMethods'].includes(key)
        ? JSON.stringify(value)
        : value.toString()
  })
  console.log(parsed)

  // Save to a file
  fs.writeFileSync('devnet.json', JSON.stringify(parsed, null, 2))
}

main().catch(console.error)
