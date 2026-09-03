import { PublicKey } from '@solana/web3.js'
import { readFileSync } from 'fs'
import * as toml from 'toml'
import { hasFlag } from '../../cli/shared/cli-utils'

export function getProgramId(): PublicKey {
  const anchorToml = toml.parse(readFileSync('./Anchor.toml', 'utf-8'))
  if (hasFlag('--mainnet')) return new PublicKey(anchorToml.programs.mainnet.dawn)
  const isDevnet = hasFlag('--devnet')
  return new PublicKey(
    isDevnet ? anchorToml.programs.devnet.dawn : anchorToml.programs.localnet.dawn,
  )
}

export const PROGRAM_ID = getProgramId()
