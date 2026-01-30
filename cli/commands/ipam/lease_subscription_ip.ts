import { PublicKey, SystemProgram } from '@solana/web3.js'

import { connect, getFlag, submitTx } from '../../shared/cli-utils'
import {
  getSubscriberIpLeasePda,
  getIpRegistryPda,
  getIpBlockPda,
  getRootIpBlockPda,
  findAvailableRootBlock,
} from '../../../sdk/utils'

async function main() {
  const deviceFlag = getFlag('--device')
  const subscriptionFlag = getFlag('--subscription')
  if (!subscriptionFlag) throw new Error('--subscription is required')

  // Device is now optional for mobile subscribers
  const device = deviceFlag ? new PublicKey(deviceFlag) : null
  const subscription = new PublicKey(subscriptionFlag)

  const tierFlag = getFlag('--tier')
  const rootIndexFlag = getFlag('--root-index')
  const blockIndexFlag = getFlag('--block-index')

  const tier = tierFlag ? parseInt(tierFlag) : 0 // subscriber by default
  const blockIndex = blockIndexFlag ? parseInt(blockIndexFlag) : 0

  const { wallet, connection, program } = await connect()

  // Find available root block if not specified
  let rootIndex: number
  if (rootIndexFlag) {
    rootIndex = parseInt(rootIndexFlag)
  } else {
    console.log('Finding available root block...')
    const availableRoot = await findAvailableRootBlock(program, tier)
    if (availableRoot === null) {
      throw new Error(
        'No available root blocks found for subscriber allocation',
      )
    }
    rootIndex = availableRoot
    console.log(`Found available root at index ${rootIndex}`)
  }

  const ipRegistry = getIpRegistryPda(tier)
  const rootIpBlock = getRootIpBlockPda(tier, rootIndex)
  const ipBlock = getIpBlockPda(rootIpBlock, blockIndex)

  // For subscriber tier, IP lease PDA is derived from subscription
  const ipLease = getSubscriberIpLeasePda(subscription)

  console.log({
    device: device ? device.toBase58() : 'none (mobile subscriber)',
    subscription: subscription.toBase58(),
    tier,
    rootIndex,
    blockIndex,
    ipRegistry: ipRegistry.toBase58(),
    rootIpBlock: rootIpBlock.toBase58(),
    ipBlock: ipBlock.toBase58(),
    ipLease: ipLease.toBase58(),
  })

  const itx = await program.methods
    .leaseSubscriptionIp()
    .accountsPartial({
      caller: wallet.payer.publicKey,
      ipRegistry,
      rootIpBlock,
      ipBlock,
      ipLease,
      device,
      subscription,
    })
    .instruction()

  const txResult = await submitTx(connection, wallet, itx, false)
  console.log('Tx submitted', { txResult })
}

main().catch(console.error)
