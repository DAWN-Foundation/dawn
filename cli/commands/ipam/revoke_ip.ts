// @ts-nocheck
import { PublicKey, SystemProgram } from '@solana/web3.js'

import { connect, getFlag, submitTx } from '../../shared/cli-utils'
import {
  getIpRegistryPda,
  getRootIpBlockPda,
  getIpBlockPda,
  getIpLeasePda,
  getSubscriberIpLeasePda,
} from '../../../sdk/utils'

async function main() {
  const tierFlag = getFlag('--tier')
  const rootIndexFlag = getFlag('--root-index')
  const blockIndexFlag = getFlag('--block-index')

  const tier = tierFlag ? parseInt(tierFlag) : 0
  const rootIndex = rootIndexFlag ? parseInt(rootIndexFlag) : 0
  const blockIndex = blockIndexFlag ? parseInt(blockIndexFlag) : 0

  const { wallet, connection, program } = await connect()

  // For subscriber tier (0), use subscription-based PDA
  // For loopback/ptp tiers (1, 2), use device-based PDA
  let ipLease: PublicKey
  if (tier === 0) {
    const subscriptionFlag = getFlag('--subscription')
    if (!subscriptionFlag) {
      throw new Error('--subscription is required for subscriber tier')
    }
    const subscription = new PublicKey(subscriptionFlag)
    ipLease = getSubscriberIpLeasePda(subscription)
    console.log(
      'Subscriber tier - using subscription:',
      subscription.toBase58(),
    )
  } else {
    const deviceFlag = getFlag('--device')
    if (!deviceFlag) {
      throw new Error('--device is required for loopback/ptp tiers')
    }
    const device = new PublicKey(deviceFlag)
    ipLease = getIpLeasePda(tier, device)
    console.log('Loopback/PtP tier - using device:', device.toBase58())
  }

  const ipRegistry = getIpRegistryPda(tier)
  const rootIpBlock = getRootIpBlockPda(tier, rootIndex)
  const ipBlock = getIpBlockPda(rootIpBlock, blockIndex)

  console.log({
    tier,
    rootIndex,
    blockIndex,
    ipRegistry: ipRegistry.toBase58(),
    rootIpBlock: rootIpBlock.toBase58(),
    ipBlock: ipBlock.toBase58(),
    ipLease: ipLease.toBase58(),
  })

  const itx = await program.methods
    .revokeIp(tier)
    .accountsPartial({
      caller: wallet.payer.publicKey,
      ipRegistry,
      rootIpBlock,
      ipBlock,
      ipLease,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  const txResult = await submitTx(connection, wallet, itx, false)
  console.log('Tx submitted', { txResult })
}

main().catch(console.error)
