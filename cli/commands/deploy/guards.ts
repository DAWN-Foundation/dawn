import { readFileSync } from 'fs'
import * as toml from 'toml'
import { Program } from '@coral-xyz/anchor'
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
 * Guard against missing --multisig on the proposal entrypoints. Exits before
 * any PublicKey is constructed from a possibly-null flag value.
 */
export function requireMultisigFlag(): string {
  const multisig = getFlag('--multisig')
  if (!multisig) {
    console.error('--multisig <pubkey> is required')
    process.exit(1)
  }
  return multisig
}
