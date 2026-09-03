import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { connect, getFlag, hasFlag } from '../../shared/cli-utils'
import { createProposal, getSquadsVaultPda } from './squads'
import { buildConfigInstructions, MAINNET_USDC } from './build_ixs'
import { assertProgramMatchesNetwork, requireMultisigFlag } from './guards'
import { getTxSigner } from './signer'

function feeFlag(name: string, dflt: number): BN {
  return new BN(hasFlag(name) ? Number(getFlag(name)) : dflt)
}

async function main() {
  const multisigPda = requireMultisigFlag()
  const stableMint = hasFlag('--stable-mint') ? new PublicKey(getFlag('--stable-mint')) : MAINNET_USDC
  const { program, connection } = await connect()
  assertProgramMatchesNetwork(program)
  const signer = await getTxSigner()
  const vaultPda = getSquadsVaultPda(multisigPda)
  console.log({
    multisig: multisigPda.toBase58(),
    vault: vaultPda.toBase58(),
    stableMint: stableMint.toBase58(),
    proposer: signer.publicKey.toBase58(),
  })

  const innerInstructions = await buildConfigInstructions(program, vaultPda, {
    stableMint,
    daoFee: feeFlag('--dao-fee', 300),
    validatorFee: feeFlag('--validator-fee', 300),
    medallionFee: feeFlag('--medallion-fee', 900),
  })
  const res = await createProposal({
    connection, signer, multisigPda, innerInstructions,
    memo: 'DAWN config (initialize_config + init_metadata), authority -> vault',
  })
  console.log('Proposal B created', { transactionIndex: res.transactionIndex.toString(), ...res })
}

main().catch((e) => { console.error(e); process.exit(1) })
