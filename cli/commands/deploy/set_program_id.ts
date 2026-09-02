import { readFileSync, writeFileSync } from 'fs'
import * as toml from 'toml'
import { PublicKey } from '@solana/web3.js'
import { hasFlag } from '../../shared/cli-utils'

/**
 * Replace the program id for a network in the two source files that bake it in:
 *   - programs/dawn/src/lib.rs   (the feature-gated `declare_id!`)
 *   - Anchor.toml                (`[programs.<network>] dawn`)
 *
 * The current id for the chosen network is read from Anchor.toml and replaced
 * everywhere it appears in both files, so you don't have to know/spell the old
 * placeholder. Use it after grinding a vanity keypair with `solana-keygen grind`.
 *
 * Usage:
 *   yarn dawn:deploy:set-program-id --devnet  <NEW_PROGRAM_ID>
 *   yarn dawn:deploy:set-program-id --mainnet <NEW_PROGRAM_ID>
 */
const LIB_RS = 'programs/dawn/src/lib.rs'
const ANCHOR_TOML = 'Anchor.toml'

function main() {
  const isMainnet = hasFlag('--mainnet')
  const isDevnet = hasFlag('--devnet')
  if (isMainnet === isDevnet) {
    console.error('Pass exactly one network flag: --devnet or --mainnet')
    process.exit(1)
  }
  const network = isMainnet ? 'mainnet' : 'devnet'

  // The new id is the first non-flag argument.
  const newId = process.argv.slice(2).find((a) => !a.startsWith('-'))
  if (!newId) {
    console.error(`Usage: yarn dawn:deploy:set-program-id --${network} <NEW_PROGRAM_ID>`)
    process.exit(1)
  }
  try {
    // eslint-disable-next-line no-new
    new PublicKey(newId)
  } catch {
    console.error(`"${newId}" is not a valid base58 public key`)
    process.exit(1)
  }

  const anchorToml = toml.parse(readFileSync(ANCHOR_TOML, 'utf-8'))
  const oldId: string | undefined = anchorToml?.programs?.[network]?.dawn
  if (!oldId) {
    console.error(
      `Could not read the current ${network} program id from ${ANCHOR_TOML} ([programs.${network}] dawn)`,
    )
    process.exit(1)
  }
  if (oldId === newId) {
    console.log(`${network} program id is already ${newId} — nothing to do.`)
    return
  }

  const changed: string[] = []
  for (const file of [LIB_RS, ANCHOR_TOML]) {
    const before = readFileSync(file, 'utf-8')
    if (!before.includes(oldId)) {
      console.warn(
        `⚠️  ${file} does not contain the current ${network} id ${oldId} — left unchanged ` +
          `(lib.rs and Anchor.toml may be out of sync; check manually).`,
      )
      continue
    }
    writeFileSync(file, before.split(oldId).join(newId))
    changed.push(file)
  }

  console.log(`✅ Set the ${network} program id`)
  console.log(`   ${oldId}`)
  console.log(`   -> ${newId}`)
  console.log(`   updated: ${changed.join(', ') || '(none)'}`)
  console.log(`\nVerify:  grep -n "${newId}" ${LIB_RS} ${ANCHOR_TOML}`)
  console.log(`Next:    anchor build -- --features ${network}`)
}

main()
