import { Connection, PublicKey, SystemProgram } from '@solana/web3.js'
import { submitTx } from '../../shared/cli-utils'
import { Program, Wallet } from '@coral-xyz/anchor'
import {
  getConfigPda,
  getIpRegistryPda,
  getRootIpBlockPda,
} from '../../../sdk/utils'
import { Dawn } from '../../../target/types/dawn'

export async function ensureRootBlockInitialized(
  program: Program<Dawn>,
  wallet: Wallet,
  connection: Connection,
  authority: PublicKey,
  tier: number,
  baseIpv4: number,
  baseCidr: number,
) {
  const [configPda] = getConfigPda(program)
  const ipRegistryPda = getIpRegistryPda(tier)

  // If registry exists and has at least one root block, skip
  try {
      const registry = await program.account.ipRegistry.fetch(ipRegistryPda)
      if (registry.rootBlockCount && registry.rootBlockCount > 0) return
  } catch (_) {
      // continue to initialize
  }

  let nextIndex = 0
  try {
      const registry = await program.account.ipRegistry.fetch(ipRegistryPda)
      nextIndex = registry.nextIndex ?? 0
  } catch (_) {
      nextIndex = 0
  }

  const rootIpBlockPda = getRootIpBlockPda(tier, nextIndex)

  const itx = await program.methods
      .initializeRootIpBlock(tier, baseIpv4, baseCidr)
      .accountsStrict({
      caller: wallet.payer.publicKey,
      config: configPda,
      ipRegistry: ipRegistryPda,
      rootIpBlock: rootIpBlockPda,
      authority: authority,
      systemProgram: SystemProgram.programId,
      })
      .instruction()

  await submitTx(connection, wallet, itx, false)
}
