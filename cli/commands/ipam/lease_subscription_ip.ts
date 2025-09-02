import { PublicKey, SystemProgram } from '@solana/web3.js'

import { connect, getFlag, submitTx } from '../../shared/cli-utils'
import {
  getIpLeasePda,
  getIpRegistryPda,
  getIpBlockPda,
  getRootIpBlockPda,
} from '../../../sdk/utils'

async function main() {
  const deviceFlag = getFlag('--device')
  const subscriptionFlag = getFlag('--subscription')
  if (!deviceFlag) throw new Error('--device is required')
  if (!subscriptionFlag) throw new Error('--subscription is required')

  const device = new PublicKey(deviceFlag)
  const subscription = new PublicKey(subscriptionFlag)

  const tierFlag = getFlag('--tier')
  const rootIndexFlag = getFlag('--root-index')
  const blockIndexFlag = getFlag('--block-index')

  const tier = tierFlag ? parseInt(tierFlag) : 0 // subscriber by default
  const rootIndex = rootIndexFlag ? parseInt(rootIndexFlag) : 0
  const blockIndex = blockIndexFlag ? parseInt(blockIndexFlag) : 0

  const { wallet, connection, program } = await connect()

  const ipRegistry = getIpRegistryPda(tier)
  const rootIpBlock = getRootIpBlockPda(tier, rootIndex)
  const ipBlock = getIpBlockPda(rootIpBlock, blockIndex)
  const ipLease = getIpLeasePda(tier, device)

  console.log({
    device: device.toBase58(),
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
      device,
      rootIpBlock,
      ipBlock,
      ipLease,
      subscription,
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  const txResult = await submitTx(connection, wallet, itx, false)
  console.log('Tx submitted', { txResult })
}

main().catch(console.error)
