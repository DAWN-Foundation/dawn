// @ts-nocheck
import { PublicKey, SystemProgram } from '@solana/web3.js'

import { connect, getFlag, submitTx } from '../../shared/cli-utils'
import {
  getIpLeasePda,
  getIpRegistryPda,
  getIpBlockPda,
  getRootIpBlockPda,
} from '../../../sdk/utils'

async function main() {
  const { wallet, connection, program } = await connect()

  const tierFlag = getFlag('--tier')
  const deviceFlag = getFlag('--device')
  const rootBlockIndexFlag = getFlag('--root-block-index')

  if (!tierFlag) {
    throw new Error('--tier is required (0=Subscriber, 1=Loopback, 2=PtP)')
  }

  if (!deviceFlag) {
    throw new Error('--device is required (device PDA)')
  }

  const tier = parseInt(tierFlag)
  const devicePda = new PublicKey(deviceFlag)
  const rootBlockIndex = rootBlockIndexFlag ? parseInt(rootBlockIndexFlag) : 0

  // Validate tier
  if (![1, 2].includes(tier)) {
    throw new Error(
      'allocate_ip only supports Loopback (1) and PtP (2) tiers. Use lease_subscription_ip for Subscriber (0) tier.',
    )
  }

  const ipRegistryPda = getIpRegistryPda(tier)
  const rootIpBlockPda = getRootIpBlockPda(tier, rootBlockIndex)
  const ipLeasePda = getIpLeasePda(tier, devicePda)

  // Check if the root IP block exists and get its authority
  let rootIpBlock
  try {
    rootIpBlock = await program.account.rootIpBlock.fetch(rootIpBlockPda)
  } catch (error) {
    throw new Error(
      `Root IP block not found at ${rootIpBlockPda.toBase58()}. Initialize it first with init_root_ip_block.`,
    )
  }

  console.log(`Root block authority: ${rootIpBlock.authority.toBase58()}`)

  // Check if the current wallet is the authority
  if (!rootIpBlock.authority.equals(wallet.payer.publicKey)) {
    throw new Error(
      `Unauthorized: Current wallet ${wallet.payer.publicKey.toBase58()} is not the root block authority ${rootIpBlock.authority.toBase58()}`,
    )
  }

  // Use the cached first_available_block_idx from the root IP block
  const blockIndex = rootIpBlock.firstAvailableBlockIdx

  if (blockIndex === null || blockIndex === undefined) {
    throw new Error(
      'No available IP blocks in this root IP block. All blocks are allocated.',
    )
  }

  const ipBlockPda = getIpBlockPda(rootIpBlockPda, blockIndex)

  console.log({
    tier,
    device: devicePda.toBase58(),
    rootBlockIndex,
    cachedBlockIndex: blockIndex,
    ipRegistryPda: ipRegistryPda.toBase58(),
    rootIpBlockPda: rootIpBlockPda.toBase58(),
    ipBlockPda: ipBlockPda.toBase58(),
    ipLeasePda: ipLeasePda.toBase58(),
  })

  const itx = await program.methods
    .allocateIp(tier)
    .accountsStrict({
      authority: wallet.payer.publicKey,
      device: devicePda,
      ipRegistry: ipRegistryPda,
      rootIpBlock: rootIpBlockPda,
      ipBlock: ipBlockPda,
      ipLease: ipLeasePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  try {
    const txResult = await submitTx(connection, wallet, itx, false)
    console.log('IP allocated successfully!', { txResult })

    // Fetch and display the allocated IP
    try {
      const ipLease = await program.account.ipLease.fetch(ipLeasePda)
      const ipAddress = ipLease.ipv4.join('.')
      console.log(`Allocated IP: ${ipAddress}/${ipLease.ipV4CidrMask}`)
    } catch (error) {
      console.log('IP allocated but could not fetch lease details:', error)
    }
  } catch (error) {
    console.error('Failed to allocate IP:', error)
  }
}

main().catch(console.error)
