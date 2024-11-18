import * as anchor from '@coral-xyz/anchor'
import { Program, AnchorError, Wallet, BN } from '@coral-xyz/anchor'
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

/// Maximum length of a device model
const MAX_DEVICE_MODEL_LEN = 32;

/// Maximum length of a device manufacturer
const MAX_DEVICE_MANUFACTURER_LEN = 64;

/// Denominator of geo coordinates (Basis Points)
const COORD_DENOMINATOR = 10 ** 10;

export const BUILDING_SIZE =
  8 + 32 + 1 + (4 + MAX_DEVICE_MANUFACTURER_LEN) + (4 + MAX_DEVICE_MODEL_LEN) + 6 + 16 + 8 + 8 + 1

type deviceType = anchor.IdlTypes<Dawn>["DeviceType"];

interface DeviceAdded {
  owner: PublicKey
  deviceType: deviceType
  manufacturer: string
  model: string
  latitude: BN
  longitude: BN
}

export const deviceTests = () =>
  describe('dawn::device', () => {
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

    test('cannot add device with an empty manufacturer', async () => {
      const manufacturer = '  '

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from([0, 0, 0, 0, 0, 0]),
          Buffer.from(manufacturer.trim()),
          Buffer.from(mock.deviceModel),
          Buffer.from(mock.deviceLatitude.toArray('le', 8)),
          Buffer.from(mock.deviceLongitude.toArray('le', 8)),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addDevice(mock.deviceType, manufacturer, mock.deviceModel, mock.deviceLatitude, mock.deviceLongitude)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: devicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe("Device manufacturer is empty")
      }
    })

    test('cannot add device with an empty model', async () => {
      const model = '  '

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from([0, 0, 0, 0, 0, 0]),
          Buffer.from(mock.deviceManufacturer),
          Buffer.from(model.trim()),
          Buffer.from(mock.deviceLatitude.toArray('le', 8)),
          Buffer.from(mock.deviceLongitude.toArray('le', 8)),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addDevice(mock.deviceType, mock.deviceManufacturer, model, mock.deviceLatitude, mock.deviceLongitude)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: devicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe("Device model is empty")
      }
    })

    test('cannot add device with manufacturer exceeding MAX_DEVICE_MANUFACTURER_LEN', async () => {
      const manufacturer = 'a'.repeat(MAX_DEVICE_MANUFACTURER_LEN + 1)

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from([0, 0, 0, 0, 0, 0]),
          Buffer.from(manufacturer.substring(0, MAX_SEED_LENGTH)),
          Buffer.from(mock.deviceModel),
          Buffer.from(mock.deviceLatitude.toArray('le', 8)),
          Buffer.from(mock.deviceLongitude.toArray('le', 8)),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addDevice(mock.deviceType, manufacturer, mock.deviceModel, mock.deviceLatitude, mock.deviceLongitude)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: devicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Device manufacturer is too long')
      }
    })

    test('cannot add device with model exceeding MAX_DEVICE_MODEL_LEN', async () => {
      const model = 'a'.repeat(MAX_DEVICE_MODEL_LEN + 1)

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from([0, 0, 0, 0, 0, 0]),
          Buffer.from(mock.deviceManufacturer),
          Buffer.from(model.substring(0, MAX_SEED_LENGTH)),
          Buffer.from(mock.deviceLatitude.toArray('le', 8)),
          Buffer.from(mock.deviceLongitude.toArray('le', 8)),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addDevice(mock.deviceType, mock.deviceManufacturer, model, mock.deviceLatitude, mock.deviceLongitude)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: devicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Device model is too long')
      }
    })

    test('cannot add device with latitude eq 0', async () => {
      const latitude = new BN(0.0000000000 * COORD_DENOMINATOR)

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from([0, 0, 0, 0, 0, 0]),
          Buffer.from(mock.deviceManufacturer),
          Buffer.from(mock.deviceModel),
          Buffer.from(latitude.toArray('le', 8)),
          Buffer.from(mock.deviceLongitude.toArray('le', 8)),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addDevice(mock.deviceType, mock.deviceManufacturer, mock.deviceModel, latitude, mock.deviceLongitude)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: devicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid number of latitude')
      }
    })

    test('cannot add device with longitude eq 0', async () => {
      const longitude = new BN(0.0000000000 * COORD_DENOMINATOR)

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from([0, 0, 0, 0, 0, 0]),
          Buffer.from(mock.deviceManufacturer),
          Buffer.from(mock.deviceModel),
          Buffer.from(mock.deviceLatitude.toArray('le', 8)),
          Buffer.from(longitude.toArray('le', 8)),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addDevice(mock.deviceType, mock.deviceManufacturer, mock.deviceModel, mock.deviceLatitude, longitude)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: devicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid number of longitude')
      }
    })

    test('adds the device', async () => {
      const tx = await program.methods
        .addDevice(
          mock.deviceType,
          mock.deviceManufacturer,
          mock.deviceModel,
          mock.deviceLatitude,
          mock.deviceLongitude,
        )
        .accounts({
          caller: mock.serviceProvider.publicKey,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      const device = await program.account.device.fetch(mock.devicePda)
      expect(device.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(Object.keys(device.deviceType)[0]).toEqual(Object.keys(mock.deviceType)[0])
      expect(device.manufacturer).toBe(mock.deviceManufacturer)
      expect(device.model).toBe(mock.deviceModel)
      expect(device.latitude.toNumber()).toBe(mock.deviceLatitude.toNumber())
      expect(device.longitude.toNumber()).toBe(mock.deviceLongitude.toNumber())

      // make sure event was emitted
      const event = await getEvent<DeviceAdded>(
        program,
        txDetails,
        'DeviceAdded',
      )

      expect(event.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(Object.keys(event.deviceType)[0]).toEqual(Object.keys(mock.deviceType)[0])
      expect(event.manufacturer).toBe(mock.deviceManufacturer)
      expect(event.model).toBe(mock.deviceModel)
      expect(event.latitude.toNumber()).toBe(mock.deviceLatitude.toNumber())
      expect(event.longitude.toNumber()).toBe(mock.deviceLongitude.toNumber())
    })

    // given previous case created this building
    test('cannot add the device with the manufacturer and model', async () => {
      // small wait to ensure previous tx is processed
      await new Promise((resolve) => setTimeout(resolve, 100))

      try {
        await program.methods
          .addDevice(
            mock.deviceType,
            mock.deviceManufacturer,
            mock.deviceModel,
            mock.deviceLatitude,
            mock.deviceLongitude,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            device: mock.devicePda,
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
          `Allocate: account Address { address: ${mock.devicePda.toBase58()}, base: None } already in use`,
        )
      }
    })
  })
