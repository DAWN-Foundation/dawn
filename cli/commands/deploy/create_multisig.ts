import * as multisig from '@sqds/multisig'
import { Keypair, PublicKey } from '@solana/web3.js'
import { getConnection, getFlag, hasFlag } from '../../shared/cli-utils'
import { getSquadsVaultPda } from './squads'
import { getTxSigner, signSendConfirm } from './signer'

const { Permissions } = multisig.types

/**
 * Create a Squads v4 multisig.
 *
 * Defaults to a 1-of-1 (the deployer wallet is the sole member with full
 * permissions, threshold 1) so a single operator can approve + execute the
 * deploy proposals on their own. Add more members with
 * `--members <pubkey,pubkey,...>` and set the approval threshold with
 * `--threshold <n>`.
 *
 * Usage:
 *   yarn dawn:deploy:create-multisig --devnet
 *   yarn dawn:deploy:create-multisig --devnet --members <pk1>,<pk2> --threshold 2
 */
async function main() {
  const connection = getConnection()
  const signer = await getTxSigner()

  // members = the creator, plus any extra pubkeys passed via --members
  const extraMembers = hasFlag('--members')
    ? getFlag('--members')!
        .split(',')
        .map((s) => new PublicKey(s.trim()))
    : []
  const memberKeys = [signer.publicKey, ...extraMembers]
  const members = memberKeys.map((key) => ({
    key,
    permissions: Permissions.all(),
  }))

  const threshold = hasFlag('--threshold') ? Number(getFlag('--threshold')) : 1
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > members.length) {
    console.error(`--threshold must be an integer between 1 and ${members.length}`)
    process.exit(1)
  }

  // The Squads program-config treasury receives the creation fee.
  const [programConfigPda] = multisig.getProgramConfigPda({})
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
    connection,
    programConfigPda,
  )

  // createKey is an ephemeral keypair that seeds the multisig PDA and signs
  // the creation transaction. It is not needed after creation.
  const createKey = Keypair.generate()
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey })

  console.log('Creating Squads v4 multisig...', {
    rpc: connection.rpcEndpoint,
    signer: signer.label,
    creator: signer.publicKey.toBase58(),
    members: memberKeys.map((k) => k.toBase58()),
    threshold,
    multisig: multisigPda.toBase58(),
  })

  const createIx = multisig.instructions.multisigCreateV2({
    treasury: programConfig.treasury,
    createKey: createKey.publicKey,
    creator: signer.publicKey,
    multisigPda,
    configAuthority: null, // member-controlled (config changes go through proposals)
    threshold,
    members,
    timeLock: 0,
    rentCollector: null,
  })
  // createKey (ephemeral) co-signs alongside the creator (local keypair or Ledger).
  const signature = await signSendConfirm(connection, [createIx], signer, {
    extraSigners: [createKey],
    commitment: 'confirmed',
  })

  const vaultPda = getSquadsVaultPda(multisigPda)

  console.log('\n✅ Multisig created')
  console.log('  tx               :', signature)
  console.log('  MULTISIG ADDRESS :', multisigPda.toBase58())
  console.log('  VAULT PDA (idx 0):', vaultPda.toBase58())
  console.log(
    '\nNext steps:\n' +
      `  1. Fund the vault PDA with SOL (rent for the config/token accounts):\n` +
      `       solana transfer ${vaultPda.toBase58()} 0.1 --allow-unfunded-recipient --url <cluster>\n` +
      `  2. Set the program's upgrade authority to the vault PDA (Phase 2).\n` +
      `  3. Create the proposals with --multisig ${multisigPda.toBase58()}.`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
