import * as anchor from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { Keypair, PublicKey } from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import { mock } from './utils'

describe('plan::building', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.Plan as Program<Plan>
  const wallet = provider.wallet as NodeWallet

  it('add the building', async () => {
    assert.exists(mock)

    const name = 'Building 1'
    const address = '123 Main St'
    const floors = 5

    const [buildingPda, buildingBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('building'), Buffer.from(name), Buffer.from(address)],
      program.programId,
    )

    const tx = await program.methods
      .addBuilding(name, address, floors)
      .accounts({ caller: mock.buildingOwner.publicKey })
      .signers([mock.buildingOwner])
      .rpc()
    assert.ok(tx.length > 0)

    const building = await program.account.building.fetch(buildingPda)

    assert.ok(building.owner.equals(mock.buildingOwner.publicKey))
    assert.equal(building.name, name)
    assert.equal(building.address, address)
    assert.equal(building.floors, floors)
    assert.equal(building.bump, buildingBump)
  })
})
