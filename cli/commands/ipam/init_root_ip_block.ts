// @ts-nocheck
import { PublicKey, SystemProgram } from '@solana/web3.js'

import { connect, getFlag, submitTx } from '../../shared/cli-utils'
import {
  getConfigPda,
  getIpRegistryPda,
  getRootIpBlockPda,
} from '../../../sdk/utils'

function ipv4ToNumber(ip: string): number {
  const parts = ip.split('.').map((p) => parseInt(p, 10))
  if (
    parts.length !== 4 ||
    parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)
  ) {
    throw new Error(
      'Invalid --base-ipv4. Expected dotted decimal like 10.64.0.0',
    )
  }
  return (
    ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
  )
}

async function main() {
  const { wallet, connection, program } = await connect()

  const tierFlag = getFlag('--tier')
  const baseIpv4Flag = getFlag('--base-ipv4')
  const baseCidrFlag = getFlag('--base-cidr')
  const authorityFlag = getFlag('--authority')

  const tier = tierFlag ? parseInt(tierFlag) : 0
  const defaults: Record<number, number> = {
    0: 0x0a400000, // 10.64.0.0 - subscriber
    1: 0x64400000, // 100.64.0.0 - loopback
    2: 0x64600000, // 100.96.0.0 - PtP
  }

  const baseIpv4 = baseIpv4Flag
    ? ipv4ToNumber(baseIpv4Flag)
    : defaults[tier] ?? defaults[0]
  const baseCidr = baseCidrFlag ? parseInt(baseCidrFlag) : 14
  const authority = authorityFlag
    ? new PublicKey(authorityFlag)
    : wallet.payer.publicKey // Default to caller as authority

  const [configPda] = getConfigPda(program)
  const ipRegistryPda = getIpRegistryPda(tier)

  // Determine next index for root block PDA derivation (0 if registry doesn't exist yet)
  let nextIndex = 0
  try {
    // fetch will fail if not initialized yet – treat as first index
    // @ts-ignore dynamic account type
    const registry = await program.account.ipRegistry.fetch(ipRegistryPda)
    nextIndex = registry.nextIndex ?? 0
  } catch (_) {
    nextIndex = 0
  }

  const rootIpBlockPda = getRootIpBlockPda(tier, nextIndex)

  console.log({
    tier,
    baseIpv4,
    baseCidr,
    authority: authority.toBase58(),
    ipRegistryPda: ipRegistryPda.toBase58(),
    rootIpBlockPda: rootIpBlockPda.toBase58(),
  })

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

  try {
    const txResult = await submitTx(connection, wallet, itx, false)
    console.log('Tx submitted', { txResult })
  } catch (error) {
    console.error(error)
  }
}

main().catch(console.error)
