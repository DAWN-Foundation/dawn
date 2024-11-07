import * as anchor from '@coral-xyz/anchor'
import { Program, AnchorError } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import {
  MAX_SEED_LENGTH,
  PublicKey,
  SendTransactionError,
} from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'

import { Dawn, IDL } from '../../target/types/dawn'
import { getEvent, mock, getProvider, PROGRAM_ID } from '../../app/utils'
import { beforeAll } from '@jest/globals'

const MAX_BUILDING_NAME_LEN = 32
const MAX_BUILDING_ADDRESS_LEN = 64

export const BUILDING_SIZE =
  8 + 32 + (4 + MAX_BUILDING_NAME_LEN) + (4 + MAX_BUILDING_ADDRESS_LEN) + 1 + 1

interface BuildingAdded {
  owner: PublicKey
  name: string
  address: string
  floors: number
}

export const buildingTests = () =>
  describe('dawn::building', () => {
    let program: Program<Dawn>

    beforeAll(async () => {
      const provider = await getProvider()
      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)
    })

    test('mock setup', () => {
      assert.exists(mock)
    })

    test('cannot add building with an empty name', async () => {
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
            caller: mock.provider.publicKey,
            building: buildingPda,
          })
          .signers([mock.provider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Building name is empty')
      }
    })

    test('cannot add building with an empty address', async () => {
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
            caller: mock.provider.publicKey,
            building: buildingPda,
          })
          .signers([mock.provider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Building address is empty')
      }
    })

    test('cannot add building with name exceeding MAX_BUILDING_NAME_LEN', async () => {
      const name = 'a'.repeat(MAX_BUILDING_NAME_LEN + 1)
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
            caller: mock.provider.publicKey,
            building: buildingPda,
          })
          .signers([mock.provider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Building name is too long')
      }
    })

    test('cannot add building with address exceeding MAX_BUILDING_ADDRESS_LEN', async () => {
      const name = 'Building 1'
      const address = 'a'.repeat(MAX_BUILDING_ADDRESS_LEN + 1)
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
            caller: mock.provider.publicKey,
            building: buildingPda,
          })
          .signers([mock.provider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(
          err.error.errorMessage,
          'Building address is too long',
        )
      }
    })

    test('cannot add building with floors less than 1', async () => {
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
            caller: mock.provider.publicKey,
            building: buildingPda,
          })
          .signers([mock.provider])
          .rpc()
        assert.ok(false)
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.strictEqual(err.error.errorMessage, 'Invalid number of floors')
      }
    })

    test('cannot add building with floors more than 255', async () => {
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
            caller: mock.provider.publicKey,
            building: buildingPda,
          })
          .signers([mock.provider])
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

    test('adds the building', async () => {
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
        .accounts({ caller: mock.provider.publicKey, building: buildingPda })
        .signers([mock.provider])
        .rpc()
      assert.ok(tx.length > 0)

      const building = await program.account.building.fetch(buildingPda)

      assert.ok(building.owner.equals(mock.provider.publicKey))
      assert.equal(building.name, name)
      assert.equal(building.address, address)
      assert.equal(building.floors, floors)
      assert.equal(building.bump, buildingBump)

      // make sure event was emitted
      const event = await getEvent<BuildingAdded>(program, tx, 'BuildingAdded')
      assert.ok(event.owner.equals(mock.provider.publicKey))
      assert.equal(event.name, name)
      assert.equal(event.address, address)
      assert.equal(event.floors, floors)
    })

    // given previous case created this building
    test('cannot add the building with the same name and address', async () => {
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
            caller: mock.provider.publicKey,
            building: buildingPda,
          })
          .signers([mock.provider])
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
