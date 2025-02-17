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
  getDevicePda,
  getDeviceLocationPda,
  getAccessDomainPda,
  MacAddress,
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'

interface DeviceAdded {
  owner: PublicKey
  device: PublicKey
  site: PublicKey
  model: PublicKey
  latitude: BN
  longitude: BN
  height: number
  macAddress: number[]
  createdAt: number
}

interface DeviceLocationVerified {
  device: PublicKey
  latitude: BN
  longitude: BN
  verifiedAt: number
}

interface DeviceAssignedToSite {
  device: PublicKey
  site: PublicKey
  createdAt: number
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
          .addDevice(
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.deviceMacAddress,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: invalidModel.publicKey,
            device: mock.devicePda,
            accessDomain: mock.accessDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
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

      try {
        await program.methods
          .addDevice(
            mock.deviceHeight,
            latitude,
            mock.deviceLongitude,
            mock.deviceMacAddress,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: mock.devicePda,
            accessDomain: mock.accessDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
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

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        mock.deviceMacAddress,
      )

      try {
        await program.methods
          .addDevice(
            mock.deviceHeight,
            mock.deviceLatitude,
            longitude,
            mock.deviceMacAddress,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
            accessDomain: mock.accessDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
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

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        mock.deviceMacAddress,
      )

      try {
        await program.methods
          .addDevice(
            height,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.deviceMacAddress,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
            accessDomain: mock.accessDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Device height is invalid')
      }
    })

    test('adds the device', async () => {
      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        mock.deviceMacAddress,
      )

      const tx = await program.methods
        .addDevice(
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.deviceMacAddress,
        )
        .accounts({
          caller: mock.serviceProvider.publicKey,
          deviceModel: mock.deviceModelPda,
          device: mock.devicePda,
          accessDomain: mock.accessDomainPda,
          deviceLocation: mock.deviceLocationPda,
          site: null,
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
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure device was created
      const device = await program.account.device.fetch(devicePda)
      expect(new BN(device.createdAt).gt(new BN(0))).toBeTruthy()
      expect(device.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(device.model.equals(mock.deviceModelPda)).toBeTruthy()

      // make sure device location was created
      const deviceLocation = await program.account.deviceLocation.fetch(
        mock.deviceLocationPda,
      )
      expect(new BN(deviceLocation.createdAt).gt(new BN(0))).toBeTruthy()
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
      expect(new BN(event.verifiedAt).gt(new BN(0))).toBeTruthy()

      // make sure device location was updated
      const deviceLocation = await program2.account.deviceLocation.fetch(
        mock.deviceLocationPda,
      )
      expect(deviceLocation.verified).toBeTruthy()
      expect(new BN(deviceLocation.verifiedAt).gt(new BN(0))).toBeTruthy()

      provider.wallet = new Wallet(mock.serviceProvider)
    })

    // given previous case created this device
    test('cannot add the same device twice', async () => {
      // small wait to ensure previous tx is processed
      await new Promise((resolve) => setTimeout(resolve, 100))

      try {
        await program.methods
          .addDevice(
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.deviceMacAddress,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: mock.devicePda,
            accessDomain: mock.accessDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
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

export const deviceSiteTests = () =>
  describe('dawn::device_site', () => {
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

    test('cannot assign device to site if site is not owned by caller', async () => {
      const wallet = loadWallet()
      provider.wallet = wallet

      const program2 = new Program<Dawn>(IDL, PROGRAM_ID, provider)

      const devicePda = getDevicePda(
        program2,
        wallet.payer,
        mock.deviceModelPda,
        mock.deviceMacAddress,
      )

      const accessDomainPda = getAccessDomainPda(program2, devicePda)

      const deviceLocationPda = getDeviceLocationPda(program2, devicePda)

      // add device
      await program2.methods
        .addDevice(
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.deviceMacAddress,
        )
        .accounts({
          caller: wallet.publicKey,
          deviceModel: mock.deviceModelPda,
          device: devicePda,
          accessDomain: accessDomainPda,
          deviceLocation: deviceLocationPda,
          site: null,
        })
        .signers([wallet.payer])
        .rpc()

      // cannot assign to the site owned by serviceProvider
      try {
        await program2.methods
          .assignDeviceToSite()
          .accounts({
            caller: wallet.publicKey,
            device: devicePda,
            site: mock.sitePda,
          })
          .signers([wallet.payer])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('A raw constraint was violated')
      } finally {
        provider.wallet = new Wallet(mock.serviceProvider)
      }
    })

    test('can assign device to site', async () => {
      const tx = await program.methods
        .assignDeviceToSite()
        .accounts({
          caller: mock.serviceProvider.publicKey,
          device: mock.devicePda,
          site: mock.sitePda,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<DeviceAssignedToSite>(
        program,
        txDetails,
        'DeviceAssignedToSite',
      )
      expect(event.device.equals(mock.devicePda)).toBeTruthy()
      expect(event.site.equals(mock.sitePda)).toBeTruthy()
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure device was updated
      const device = await program.account.device.fetch(mock.devicePda)
      expect(device.site.equals(mock.sitePda)).toBeTruthy()
    })

    test('can add device with site', async () => {
      const macAddress: MacAddress = [0, 0, 0, 0, 0, 1]

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        macAddress,
      )

      const accessDomainPda = getAccessDomainPda(program, devicePda)

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)

      const tx = await program.methods
        .addDevice(
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          macAddress,
        )
        .accounts({
          caller: mock.serviceProvider.publicKey,
          deviceModel: mock.deviceModelPda,
          device: devicePda,
          accessDomain: accessDomainPda,
          deviceLocation: deviceLocationPda,
          site: mock.sitePda,
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
      expect(event.device.equals(devicePda)).toBeTruthy()
      expect(event.site.equals(mock.sitePda)).toBeTruthy()
      expect(event.model.equals(mock.deviceModelPda)).toBeTruthy()
      expect(event.latitude.toString()).toBe(mock.deviceLatitude.toString())
      expect(event.longitude.toString()).toBe(mock.deviceLongitude.toString())
      expect(event.macAddress).toEqual(macAddress)
    })
  })
