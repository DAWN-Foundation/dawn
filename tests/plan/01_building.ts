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
import { mock } from './utils'

const MAX_BUILDING_NAME_LENGTH = 32
const MAX_BUILDING_ADDRESS_LENGTH = 64

describe('plan::building', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.Plan as Program<Plan>
  const wallet = provider.wallet as NodeWallet

  it('cannot add building with an empty name', async () => {
    assert.exists(mock)

    const name = '  '
    const address = '123 Main St'
    const floors = 5

    const [buildingPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('building'),
        Buffer.from(name.trim()),
        Buffer.from(address),
        Buffer.from([floors]),
      ],
      program.programId,
    )

    try {
      await program.methods
        .addBuilding(name, address, floors)
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
      assert.strictEqual(err.error.errorMessage, 'Building name is empty')
      assert.strictEqual(err.error.errorCode.number, 6001)
    }
  })

  it('cannot add building with an empty address', async () => {
    assert.exists(mock)

    const name = 'Building 1'
    const address = '  '
    const floors = 5

    const [buildingPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('building'),
        Buffer.from(name),
        Buffer.from(address.trim()),
        Buffer.from([floors]),
      ],
      program.programId,
    )

    try {
      await program.methods
        .addBuilding(name, address, floors)
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
      assert.strictEqual(err.error.errorMessage, 'Building address is empty')
      assert.strictEqual(err.error.errorCode.number, 6002)
    }
  })

  it('cannot add building with name exceeding MAX_BUILDING_NAME_LENGTH', async () => {
    assert.exists(mock)

    const name = 'a'.repeat(MAX_BUILDING_NAME_LENGTH + 1)
    const address = '123 Main St'
    const floors = 5

    const [buildingPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('building'),
        Buffer.from(name.substring(0, MAX_SEED_LENGTH)),
        Buffer.from(address),
        Buffer.from([floors]),
      ],
      program.programId,
    )

    try {
      await program.methods
        .addBuilding(name, address, floors)
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
      assert.strictEqual(err.error.errorMessage, 'Building name is too long')
      assert.strictEqual(err.error.errorCode.number, 6004)
    }
  })

  it('cannot add building with address exceeding MAX_BUILDING_ADDRESS_LENGTH', async () => {
    assert.exists(mock)

    const name = 'Building 1'
    const address = 'a'.repeat(MAX_BUILDING_ADDRESS_LENGTH + 1)
    const floors = 5

    const [buildingPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('building'),
        Buffer.from(name),
        Buffer.from(address.substring(0, MAX_SEED_LENGTH)),
        Buffer.from([floors]),
      ],
      program.programId,
    )

    try {
      await program.methods
        .addBuilding(name, address, floors)
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
      assert.strictEqual(err.error.errorMessage, 'Building address is too long')
      assert.strictEqual(err.error.errorCode.number, 6005)
    }
  })

  it('cannot add building with floors less than 1', async () => {
    assert.exists(mock)

    const name = 'Building 1'
    const address = '123 Main St'
    const floors = 0

    const [buildingPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('building'),
        Buffer.from(name),
        Buffer.from(address),
        Buffer.from([floors]),
      ],
      program.programId,
    )

    try {
      await program.methods
        .addBuilding(name, address, floors)
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
      assert.strictEqual(err.error.errorMessage, 'Invalid number of floors')
      assert.strictEqual(err.error.errorCode.number, 6003)
    }
  })

  it('cannot add building with floors more than 255', async () => {
    assert.exists(mock)

    const name = 'Building 1'
    const address = '123 Main St'
    const floors = 255 + 1

    const [buildingPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('building'),
        Buffer.from(name),
        Buffer.from(address),
        Buffer.from([floors]),
      ],
      program.programId,
    )

    try {
      await program.methods
        .addBuilding(name, address, floors)
        .accounts({
          caller: mock.buildingOwner.publicKey,
          building: buildingPda,
        })
        .signers([mock.buildingOwner])
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof RangeError)
      const err: RangeError = error
      assert.strictEqual(
        err.message,
        'The value of "value" is out of range. It must be >= 0 and <= 255. Received 256',
      )
    }
  })

  it('adds the building', async () => {
    assert.exists(mock)

    const name = 'Building 1'
    const address = '123 Main St'
    const floors = 5

    const [buildingPda, buildingBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('building'),
        Buffer.from(name),
        Buffer.from(address),
        Buffer.from([floors]),
      ],
      program.programId,
    )

    const tx = await program.methods
      .addBuilding(name, address, floors)
      .accounts({ caller: mock.buildingOwner.publicKey, building: buildingPda })
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

  // given previous case created this building
  it('cannot add the building with the same name and address', async () => {
    assert.exists(mock)

    const name = 'Building 1'
    const address = '123 Main St'
    const floors = 5

    const [buildingPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('building'),
        Buffer.from(name),
        Buffer.from(address),
        Buffer.from([floors]),
      ],
      program.programId,
    )

    try {
      await program.methods
        .addBuilding(name, address, floors)
        .accounts({
          caller: mock.buildingOwner.publicKey,
          building: buildingPda,
        })
        .signers([mock.buildingOwner])
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof SendTransactionError)
      const err: SendTransactionError = error
      assert.strictEqual(
        err.transactionError.message,
        'Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0',
      )
    }
  })
})
