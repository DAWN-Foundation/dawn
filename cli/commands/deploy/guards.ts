import { readFileSync } from 'fs'
import * as toml from 'toml'
import { Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { Dawn } from '../../../target/types/dawn'
import { hasFlag, getFlag } from '../../shared/cli-utils'

type Network = 'mainnet' | 'devnet' | 'localnet'

function targetNetwork(): Network {
  if (hasFlag('--mainnet')) return 'mainnet'
  if (hasFlag('--devnet')) return 'devnet'
  return 'localnet'
}

/**
 * Guard against creating a Squads proposal against the wrong program id.
 * Compares the connected program's id against the id declared for the
 * targeted network (--mainnet / --devnet / localnet) in Anchor.toml, and
 * exits before any transaction is built if they don't match.
 */
export function assertProgramMatchesNetwork(program: Program<Dawn>): void {
  const anchorToml = toml.parse(readFileSync('./Anchor.toml', 'utf-8'))
  const network = targetNetwork()
  const expected = anchorToml.programs[network].dawn
  const actual = program.programId.toBase58()

  if (actual !== expected) {
    console.error(
      `program id ${actual} does not match the ${network} program id ${expected} in Anchor.toml — did you run \`anchor build -- --features mainnet\`?`,
    )
    process.exit(1)
  }
}

/**
 * Read and validate the required --multisig flag, returning it as a PublicKey.
 * Exits with a clear message if it's missing or not a valid base58 pubkey
 * (e.g. a mistyped/truncated address), instead of throwing a raw
 * "Invalid public key input" with a stack trace.
 */
export function requireMultisigFlag(): PublicKey {
  const multisig = getFlag('--multisig')
  if (!multisig) {
    console.error('--multisig <pubkey> is required')
    process.exit(1)
  }
  try {
    return new PublicKey(multisig)
  } catch {
    console.error(`--multisig is not a valid base58 public key: "${multisig}"`)
    process.exit(1)
  }
}
