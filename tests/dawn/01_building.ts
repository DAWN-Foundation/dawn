import * as anchor from '@coral-xyz/anchor'
import { Program, AnchorError, Wallet } from '@coral-xyz/anchor'
import {
  MAX_SEED_LENGTH,
  PublicKey,
  SendTransactionError,
} from '@solana/web3.js'

import { Dawn, IDL } from '../../target/types/dawn'
import {
  getEvent,
  mock,
  getProvider,
  PROGRAM_ID,
  confirmTx,
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'
import { BanksClient } from 'solana-bankrun'
import { BankrunProvider } from 'anchor-bankrun'

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
    let provider: BankrunProvider

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.serviceProvider)

      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)
    })

    test('mock setup', () => {
      expect(mock).toBeDefined()
    })

    test('cannot add building with an empty name', async () => {
      const name = '  '

      const [buildingPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('building'),
          Buffer.from(name.trim()),
          Buffer.from(mock.buildingAddress),
          Buffer.from([mock.buildingFloors]),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addBuilding(name, mock.buildingAddress, mock.buildingFloors)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            building: buildingPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Building name is empty')
      }
    })

    test('cannot add building with an empty address', async () => {
      const address = '  '

      const [buildingPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('building'),
          Buffer.from(mock.buildingName),
          Buffer.from(address.trim()),
          Buffer.from([mock.buildingFloors]),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addBuilding(mock.buildingName, address, mock.buildingFloors)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            building: buildingPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Building address is empty')
      }
    })

    test('cannot add building with name exceeding MAX_BUILDING_NAME_LEN', async () => {
      const name = 'a'.repeat(MAX_BUILDING_NAME_LEN + 1)

      const [buildingPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('building'),
          Buffer.from(name.substring(0, MAX_SEED_LENGTH)),
          Buffer.from(mock.buildingAddress),
          Buffer.from([mock.buildingFloors]),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addBuilding(name, mock.buildingAddress, mock.buildingFloors)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            building: buildingPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Building name is too long')
      }
    })

    test('cannot add building with address exceeding MAX_BUILDING_ADDRESS_LEN', async () => {
      const address = 'a'.repeat(MAX_BUILDING_ADDRESS_LEN + 1)

      const [buildingPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('building'),
          Buffer.from(mock.buildingName),
          Buffer.from(address.substring(0, MAX_SEED_LENGTH)),
          Buffer.from([mock.buildingFloors]),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addBuilding(mock.buildingName, address, mock.buildingFloors)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            building: buildingPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Building address is too long')
      }
    })

    test('cannot add building with floors less than 1', async () => {
      const floors = 0

      const [buildingPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('building'),
          Buffer.from(mock.buildingName),
          Buffer.from(mock.buildingAddress),
          Buffer.from([floors]),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addBuilding(mock.buildingName, mock.buildingAddress, floors)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            building: buildingPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid number of floors')
      }
    })

    test('cannot add building with floors more than 255', async () => {
      const floors = 255 + 1

      const [buildingPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('building'),
          Buffer.from(mock.buildingName),
          Buffer.from(mock.buildingAddress),
          Buffer.from([floors]),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addBuilding(mock.buildingName, mock.buildingAddress, floors)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            building: buildingPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error.message).toBe(
          'The value of "value" is out of range. It must be >= 0 and <= 255. Received 256',
        )
      }
    })

    test('adds the building', async () => {
      const tx = await program.methods
        .addBuilding(
          mock.buildingName,
          mock.buildingAddress,
          mock.buildingFloors,
        )
        .accounts({
          caller: mock.serviceProvider.publicKey,
          building: mock.buildingPda,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      const building = await program.account.building.fetch(mock.buildingPda)
      expect(building.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(building.name).toBe(mock.buildingName)
      expect(building.address).toBe(mock.buildingAddress)
      expect(building.floors).toBe(mock.buildingFloors)

      // make sure event was emitted
      const event = await getEvent<BuildingAdded>(
        program,
        txDetails,
        'BuildingAdded',
      )
      expect(event.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(event.name).toBe(mock.buildingName)
      expect(event.address).toBe(mock.buildingAddress)
      expect(event.floors).toBe(mock.buildingFloors)
    })

    // given previous case created this building
    test('cannot add the building with the same name and address', async () => {
      // small wait to ensure previous tx is processed
      await new Promise((resolve) => setTimeout(resolve, 100))

      try {
        await program.methods
          .addBuilding(
            mock.buildingName,
            mock.buildingAddress,
            mock.buildingFloors,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            building: mock.buildingPda,
          })
          .signers([mock.serviceProvider])
          .rpc()

        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof SendTransactionError).toBeTruthy()
        const err: SendTransactionError = error
        const txError = err.logs.find((log) => log.includes('already in use'))
        expect(txError).toBeDefined()
        expect(txError).toBe(
          `Allocate: account Address { address: ${mock.buildingPda.toBase58()}, base: None } already in use`,
        )
      }
    })
  })
