import * as anchor from '@coral-xyz/anchor'
import { Program, AnchorError, Wallet } from '@coral-xyz/anchor'
import {
  MAX_SEED_LENGTH,
  PublicKey,
  SendTransactionError,
} from '@solana/web3.js'

import { Dawn, IDL } from '../../target/types/dawn'
import { getEvent, mock, getProvider, PROGRAM_ID } from '../../app/utils'
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
    let client: BanksClient

    beforeAll(async () => {
      const chain = await getProvider()
      provider = chain.provider
      provider.wallet = new Wallet(mock.provider)
      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)
      client = chain.client
    })

    test('mock setup', () => {
      expect(mock).toBeDefined()
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
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Building name is empty')
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
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Building address is empty')
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
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Building name is too long')
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
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Building address is too long')
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
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid number of floors')
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
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error.message).toBe(
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
        .transaction()

      tx.recentBlockhash = (await client.getLatestBlockhash())[0]
      tx.feePayer = mock.provider.publicKey
      tx.sign(provider.wallet.payer)
      console.log({
        tx,
        wallet: provider.wallet.publicKey.toBase58(),
      })
      const txDetails = await provider.context.banksClient.processTransaction(
        tx,
      )

      const building = await program.account.building.fetch(buildingPda)
      expect(building.owner.equals(mock.provider.publicKey)).toBeTruthy()
      expect(building.name).toBe(name)
      expect(building.address).toBe(address)
      expect(building.floors).toBe(floors)
      expect(building.bump).toBe(buildingBump)

      // make sure event was emitted
      const event = await getEvent<BuildingAdded>(
        program,
        txDetails,
        'BuildingAdded',
      )
      expect(event.owner.equals(mock.provider.publicKey)).toBeTruthy()
      expect(event.name).toBe(name)
      expect(event.address).toBe(address)
      expect(event.floors).toBe(floors)
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
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof SendTransactionError).toBeTruthy()
        const err: SendTransactionError = error
        expect(err.transactionError.message).toBe(
          'Error processing Instruction 0: custom program error: 0x0',
        )
      }
    })
  })
