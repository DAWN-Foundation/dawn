import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { assert } from 'chai'

import { Plan } from '../../target/types/plan'

describe('plan::initialize', () => {
  anchor.setProvider(anchor.AnchorProvider.env())

  const program = anchor.workspace.Plan as Program<Plan>

  it('initializes the program', async () => {
    const tx = await program.methods.initialize().rpc()
    assert.ok(tx.length === 88)
  })
})
