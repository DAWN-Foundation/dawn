import * as anchor from '@coral-xyz/anchor'
import { Program, AnchorError, Wallet, BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey, SendTransactionError } from '@solana/web3.js'

import { Dawn, IDL } from '../../target/types/dawn'
import {
  getEvent,
  mock,
  getProvider,
  PROGRAM_ID,
  confirmTx,
  COORD_DENOMINATOR,
  loadWallet,
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'

interface DeviceAdded {
  owner: PublicKey
  device: PublicKey
  model: PublicKey
  latitude: BN
  longitude: BN
  height: number
}

interface DeviceLocationVerified {
  device: PublicKey
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
          .addDevice(mock.deviceHeight, mock.deviceLatitude, mock.deviceLongitude, mock.deviceMacAddress)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: invalidModel.publicKey,
            device: mock.devicePda,
            deviceLocation: mock.deviceLocationPda,
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
      const latitude = new BN(0.0 * COORD_DENOMINATOR)

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from(mock.serviceProvider.publicKey.toBytes()),
          Buffer.from(mock.deviceModelPda.toBytes()),
          Buffer.from(mock.deviceMacAddress),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addDevice(mock.deviceHeight, latitude, mock.deviceLongitude, mock.deviceMacAddress)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            deviceLocation: mock.deviceLocationPda,
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
      const longitude = new BN(0.0 * COORD_DENOMINATOR)

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from(mock.serviceProvider.publicKey.toBytes()),
          Buffer.from(mock.deviceModelPda.toBytes()),
          Buffer.from(mock.deviceMacAddress),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addDevice(mock.deviceHeight, mock.deviceLatitude, longitude, mock.deviceMacAddress)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
            deviceLocation: mock.deviceLocationPda,
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

    test('cannot add device with height eq 0', async () => {
      const height = 0

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from(mock.serviceProvider.publicKey.toBytes()),
          Buffer.from(mock.deviceModelPda.toBytes()),
          Buffer.from(mock.deviceMacAddress),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addDevice(height, mock.deviceLatitude, mock.deviceLongitude, mock.deviceMacAddress)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
            deviceLocation: mock.deviceLocationPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        console.log(error)

        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Device height is invalid')
      }
    })


    test('adds the device', async () => {

      const [devicePda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device'),
          Buffer.from(mock.serviceProvider.publicKey.toBytes()),
          Buffer.from(mock.deviceModelPda.toBytes()),
          Buffer.from(mock.deviceMacAddress),
        ],
        program.programId,
      )

      const tx = await program.methods
        .addDevice(mock.deviceHeight, mock.deviceLatitude, mock.deviceLongitude, mock.deviceMacAddress)
        .accounts({
          caller: mock.serviceProvider.publicKey,
          deviceModel: mock.deviceModelPda,
          device: mock.devicePda,
          deviceLocation: mock.deviceLocationPda,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<DeviceAdded>(
        program,
        txDetails,
        'DeviceAdded',
      )
      expect(event.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(event.device.equals(mock.devicePda)).toBeTruthy()
      expect(event.model.equals(mock.deviceModelPda)).toBeTruthy()
      expect(event.latitude.toString()).toBe(mock.deviceLatitude.toString())
      expect(event.longitude.toString()).toBe(mock.deviceLongitude.toString())
      expect(event.height.toString()).toBe(mock.deviceHeight.toString())

      // make sure device was created
      const device = await program.account.device.fetch(devicePda)
      expect(device.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(device.model.equals(mock.deviceModelPda)).toBeTruthy()

      // make sure device location was created
      const deviceLocation = await program.account.deviceLocation.fetch(
        mock.deviceLocationPda,
      )
      expect(deviceLocation.device.equals(mock.devicePda)).toBeTruthy()
      expect(deviceLocation.latitude.toString()).toBe(
        mock.deviceLatitude.toString(),
      )
      expect(deviceLocation.longitude.toString()).toBe(
        mock.deviceLongitude.toString(),
      )
      expect(deviceLocation.height.toString()).toBe(
        mock.deviceHeight.toString(),
      )
      expect(deviceLocation.verified).toBeFalsy()
    })

    test('cannot verify device location as non-authority', async () => {
      try {
        await program.methods
          .verifyDeviceLocation()
          .accounts({
            caller: mock.serviceProvider.publicKey,
            config: mock.configPda,
            device: mock.devicePda,
            deviceLocation: mock.deviceLocationPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        const txError = err.logs.find((log) =>
          log.includes('A raw constraint was violated'),
        )
        expect(txError).toBeDefined()
        expect(
          txError.includes('AnchorError caused by account: caller.'),
        ).toBeTruthy()
      }
    })

    test('verifies device location as authority', async () => {
      const wallet = loadWallet()
      provider.wallet = wallet

      const program2 = new Program<Dawn>(IDL, PROGRAM_ID, provider)

      const tx = await program2.methods
        .verifyDeviceLocation()
        .accounts({
          caller: wallet.publicKey,
          config: mock.configPda,
          device: mock.devicePda,
          deviceLocation: mock.deviceLocationPda,
        })
        .signers([wallet.payer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<DeviceLocationVerified>(
        program2,
        txDetails,
        'DeviceLocationVerified',
      )
      expect(event.device.equals(mock.devicePda)).toBeTruthy()
      expect(event.latitude.toString()).toBe(mock.deviceLatitude.toString())
      expect(event.longitude.toString()).toBe(mock.deviceLongitude.toString())

      // make sure device location was updated
      const deviceLocation = await program2.account.deviceLocation.fetch(
        mock.deviceLocationPda,
      )
      expect(deviceLocation.verified).toBeTruthy()

      provider.wallet = new Wallet(mock.serviceProvider)
    })

    // given previous case created this device
    test('cannot add the same device twice', async () => {
      // small wait to ensure previous tx is processed
      await new Promise((resolve) => setTimeout(resolve, 100))

      try {
        await program.methods
          .addDevice(mock.deviceHeight, mock.deviceLatitude, mock.deviceLongitude, mock.deviceMacAddress)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: mock.devicePda,
            deviceLocation: mock.deviceLocationPda,
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
