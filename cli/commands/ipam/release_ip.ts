import { PublicKey, SystemProgram } from '@solana/web3.js'

import { connect, getFlag, submitTx } from '../../shared/cli-utils'
import {
  getIpRegistryPda,
  getRootIpBlockPda,
  getIpBlockPda,
} from '../../../sdk/utils'

async function main() {
  const deviceFlag = getFlag('--device')
  const tierFlag = getFlag('--tier')
  const rootIndexFlag = getFlag('--root-index')
  const blockIndexFlag = getFlag('--block-index')
  const unitIndexFlag = getFlag('--unit-index')
  if (!deviceFlag) throw new Error('--device is required')

  const device = new PublicKey(deviceFlag)
  const tier = tierFlag ? parseInt(tierFlag) : 0
  const rootIndex = rootIndexFlag ? parseInt(rootIndexFlag) : 0
  const blockIndex = blockIndexFlag ? parseInt(blockIndexFlag) : 0
  const unitIndex = unitIndexFlag ? parseInt(unitIndexFlag) : 0

  const { wallet, connection, program } = await connect()

  const ipRegistry = getIpRegistryPda(tier)
  const rootIpBlock = getRootIpBlockPda(tier, rootIndex)
  const ipBlock = getIpBlockPda(rootIpBlock, blockIndex)

  console.log({
    device: device.toBase58(),
    tier,
    rootIndex,
    blockIndex,
    unitIndex,
  })

  const itx = await program.methods
    .releaseIp(unitIndex)
    .accountsPartial({
      caller: wallet.payer.publicKey,
      ipRegistry,
      rootIpBlock,
      ipBlock,
      // ipLease PDA is derived inside program by seeds; not passed in this CLI
      systemProgram: SystemProgram.programId,
    })
    .instruction()

  const txResult = await submitTx(connection, wallet, itx, false)
  console.log('Tx submitted', { txResult })
}

main().catch(console.error)
