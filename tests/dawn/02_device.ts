import * as anchor from '@coral-xyz/anchor'
import { Program, AnchorError, Wallet, BN } from '@coral-xyz/anchor'
import {
  Keypair,
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
  COORD_DENOMINATOR,
  DeviceType,
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'
import { BanksClient } from 'solana-bankrun'
import { BankrunProvider } from 'anchor-bankrun'

export const DEVICE_SIZE =
  8 + // id
  32 + // owner
  32 + // model
  8 + // latitude
  8 + // longitude
  1 // bump

interface DeviceAdded {
  owner: PublicKey
  device: PublicKey
  model: PublicKey
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

    test('cannot add device with invalid model', async () => {
      const invalidModel = Keypair.generate()

      try {
        await program.methods
          .addDevice(mock.deviceLatitude, mock.deviceLongitude)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: invalidModel.publicKey,
            device: mock.devicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe(
          'The program expected this account to be already initialized',
        )
      }
    })

    test('cannot add device with latitude eq 0', async () => {
      const latitude = new BN(0.0).mul(COORD_DENOMINATOR)

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from(mock.serviceProvider.publicKey.toBytes()),
          Buffer.from(mock.deviceModelPda.toBytes()),
          Buffer.from(latitude.toArray('le', 8)),
          Buffer.from(mock.deviceLongitude.toArray('le', 8)),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addDevice(latitude, mock.deviceLongitude)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Latitude coordinate is invalid')
      }
    })

    test('cannot add device with longitude eq 0', async () => {
      const longitude = new BN(0.0).mul(COORD_DENOMINATOR)

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from(mock.serviceProvider.publicKey.toBytes()),
          Buffer.from(mock.deviceModelPda.toBytes()),
          Buffer.from(mock.deviceLatitude.toArray('le', 8)),
          Buffer.from(longitude.toArray('le', 8)),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addDevice(mock.deviceLatitude, longitude)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Longitude coordinate is invalid')
      }
    })

    test('adds the device', async () => {
      const tx = await program.methods
        .addDevice(mock.deviceLatitude, mock.deviceLongitude)
        .accounts({
          caller: mock.serviceProvider.publicKey,
          deviceModel: mock.deviceModelPda,
          device: mock.devicePda,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      const device = await program.account.device.fetch(mock.devicePda)
      expect(device.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(device.model.equals(mock.deviceModelPda)).toBeTruthy()
      expect(device.latitude.toNumber()).toBe(mock.deviceLatitude.toNumber())
      expect(device.longitude.toNumber()).toBe(mock.deviceLongitude.toNumber())

      // make sure event was emitted
      const event = await getEvent<DeviceAdded>(
        program,
        txDetails,
        'DeviceAdded',
      )
      expect(event.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(event.device.equals(mock.devicePda)).toBeTruthy()
      expect(event.model.equals(mock.deviceModelPda)).toBeTruthy()
      expect(event.latitude.toNumber()).toBe(mock.deviceLatitude.toNumber())
      expect(event.longitude.toNumber()).toBe(mock.deviceLongitude.toNumber())
    })

    // given previous case created this device
    test('cannot add the same device twice', async () => {
      // small wait to ensure previous tx is processed
      await new Promise((resolve) => setTimeout(resolve, 100))

      try {
        await program.methods
          .addDevice(mock.deviceLatitude, mock.deviceLongitude)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
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
