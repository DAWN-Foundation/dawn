import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import {
  Keypair,
  MAX_SEED_LENGTH,
  PublicKey,
  SendTransactionError,
} from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import { getEvent, mock } from './utils'

describe('plan::plan', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.Plan as Program<Plan>
  const wallet = provider.wallet as NodeWallet

  const buildingName = 'Building 1'
  const buildingAddress = '123 Main St'
  const buildingFloors = 5
  const [buildingPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('building'),
      Buffer.from(buildingName),
      Buffer.from(buildingAddress),
      Buffer.from([buildingFloors]),
    ],
    program.programId,
  )

  it('cannot add plan with zero price', async () => {
    assert.exists(mock)

    const price = new BN(0)

    try {
      await program.methods
        .addPlan(price)
        .accounts({
          caller: mock.buildingOwner.publicKey,
          building: buildingPda,
        })
        .signers([mock.buildingOwner])
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof AnchorError)
      const err: AnchorError = error
      assert.strictEqual(err.error.errorMessage, 'Plan price is zero')
      assert.strictEqual(err.error.errorCode.number, 6006)
    }
  })

  it('cannot be added for a building not owned by the caller', async () => {
    assert.exists(mock)

    const price = new BN(5)

    try {
      await program.methods
        .addPlan(price)
        .accounts({
          caller: wallet.publicKey,
          building: buildingPda,
        })
        .signers([wallet.payer])
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof AnchorError)
      const err: AnchorError = error
      assert.strictEqual(
        err.error.errorMessage,
        'A raw constraint was violated',
      )
      assert.strictEqual(err.error.errorCode.number, 2003)
    }
  })

  it('adds the plan', async () => {
    assert.exists(mock)

    const building = await program.account.building.fetch(buildingPda)
    assert.ok(building.owner.equals(mock.buildingOwner.publicKey))

    const price = new BN(5)

    const [planPda, planBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('plan'),
        Buffer.from(building.address),
        Buffer.from(price.toArray('le', 8)),
      ],
      program.programId,
    )

    const tx = await program.methods
      .addPlan(price)
      .accounts({
        caller: mock.buildingOwner.publicKey,
        building: buildingPda,
      })
      .signers([mock.buildingOwner])
      .rpc()
    assert.ok(tx.length > 0)

    const plan = await program.account.plan.fetch(planPda)

    assert.ok(plan.owner.equals(mock.buildingOwner.publicKey))
    assert.ok(plan.building.equals(buildingPda))
    assert.ok(plan.price.eq(price))
    assert.equal(plan.bump, planBump)

    // make sure event was emitted
    const event = await getEvent(program, tx, 'planAdded')
    assert.ok(event.owner.equals(mock.buildingOwner.publicKey))
    assert.ok(event.building.equals(buildingPda))
    assert.ok(event.price.eq(price))
  })
})
