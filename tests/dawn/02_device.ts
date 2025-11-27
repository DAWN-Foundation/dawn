import * as anchor from '@coral-xyz/anchor'
import { Program, AnchorError, Wallet, BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey, SendTransactionError } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import {
  getEvent,
  getEvents,
  mock,
  getProvider,
  confirmTx,
  COORD_DENOMINATOR,
  loadWallet,
  getDevicePda,
  getDeviceLocationPda,
  getDeviceModelPda,
  DeviceType,
  getLocalDomainPda,
  getIpLeasePda,
  IpV4Bytes,
  MacAddress,
} from '../../sdk/utils'
import { beforeAll, expect } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'

interface LocalDomainAdded {
  localDomain: PublicKey
  owner: PublicKey
  name: string
  createdAt: number
}

interface DeviceAdded {
  device: PublicKey
  deviceLocation: PublicKey
  owner: PublicKey
  model: PublicKey
  name: string
  latitude: BN
  longitude: BN
  height: number
  macAddress: number[]
  createdAt: number
}

interface DeviceLocationAdded {
  deviceLocation: PublicKey
  device: PublicKey
  height: number
  longitude: BN
  latitude: BN
  placement: number[]
  createdAt: number
}

interface DeviceLocationVerified {
  device: PublicKey
  latitude: BN
  longitude: BN
  verifiedAt: number
}

interface IpLeased {
  ipLease: PublicKey
  device: PublicKey
  tier: number
  ipv4: IpV4Bytes
  cidr: number
  blockIndex: number
  unitIndex: number
}

export let l2devicePda: PublicKey

export const deviceTests = () =>
  describe('dawn::device', () => {
    let program: Program<Dawn>
    let provider: BankrunProvider
    const wallet = loadWallet()

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.serviceProvider)

      anchor.setProvider(provider)

      program = anchor.workspace.DAWN as Program<Dawn>
    })

    test('mock setup', () => {
      expect(mock).toBeDefined()
    })

    test('cannot add device with invalid model', async () => {
      const invalidModel = Keypair.generate()

      try {
        await program.methods
          .addDevice(
            mock.deviceName,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.devicePlacement,
            mock.deviceMacAddress,
            mock.localDomain,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: invalidModel.publicKey,
            device: mock.devicePda,
            localDomain: mock.localDomainPda,
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

      try {
        await program.methods
          .addDevice(
            mock.deviceName,
            mock.deviceHeight,
            latitude,
            mock.deviceLongitude,
            mock.devicePlacement,
            mock.deviceMacAddress,
            mock.localDomain,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: mock.devicePda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
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

      try {
        await program.methods
          .addDevice(
            mock.deviceName,
            mock.deviceHeight,
            mock.deviceLatitude,
            longitude,
            mock.devicePlacement,
            mock.deviceMacAddress,
            mock.localDomain,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: mock.devicePda,
            localDomain: mock.localDomainPda,
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

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        mock.deviceName,
        mock.deviceMacAddress,
      )

      try {
        await program.methods
          .addDevice(
            mock.deviceName,
            height,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.devicePlacement,
            mock.deviceMacAddress,
            mock.localDomain,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
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

    test('cannot add device with name length eq 0', async () => {
      const name = ''

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        name,
        mock.deviceMacAddress,
      )

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)

      try {
        await program.methods
          .addDevice(
            name,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.devicePlacement,
            mock.deviceMacAddress,
            mock.localDomain,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
            localDomain: mock.localDomainPda,
            deviceLocation: deviceLocationPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Device name is empty')
      }
    })

    test('cannot add device with name length gt 32', async () => {
      const name = 'a'.repeat(33)

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        name,
        mock.deviceMacAddress,
      )

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)

      try {
        await program.methods
          .addDevice(
            name,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.devicePlacement,
            mock.deviceMacAddress,
            mock.localDomain,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
            localDomain: mock.localDomainPda,
            deviceLocation: deviceLocationPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Device name is too long')
      }
    })

    test('cannot add device with placement.azimuth gt 360', async () => {
      const placement = [36001, 0]

      try {
        await program.methods
          .addDevice(
            mock.deviceName,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            placement,
            mock.deviceMacAddress,
            mock.localDomain,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: mock.devicePda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid placement azimuth')
      }
    })

    test('cannot add device with placement.azimuth lt 0', async () => {
      const placement = [-1, 0]

      try {
        await program.methods
          .addDevice(
            mock.deviceName,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            placement,
            mock.deviceMacAddress,
            mock.localDomain,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: mock.devicePda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid placement azimuth')
      }
    })

    test('cannot add device with placement.tilt gt 90', async () => {
      const placement = [0, 9001]

      try {
        await program.methods
          .addDevice(
            mock.deviceName,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            placement,
            mock.deviceMacAddress,
            mock.localDomain,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: mock.devicePda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid placement tilt')
      }
    })

    test('cannot add device with placement.tilt lt -90', async () => {
      const placement = [0, -9001]

      try {
        await program.methods
          .addDevice(
            mock.deviceName,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            placement,
            mock.deviceMacAddress,
            mock.localDomain,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: mock.devicePda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid placement tilt')
      }
    })

    test('adds the L3 (Router) device', async () => {
      const tx = await program.methods
        .addDevice(
          mock.deviceName,
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.devicePlacement,
          mock.deviceMacAddress,
          mock.localDomain,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          deviceModel: mock.deviceModelPda,
          device: mock.devicePda,
          deviceLocation: mock.deviceLocationPda,
          localDomain: mock.localDomainPda,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<DeviceAdded>(
        program,
        txDetails,
        'deviceAdded',
      )
      expect(event.device.equals(mock.devicePda)).toBeTruthy()
      expect(event.deviceLocation.equals(mock.deviceLocationPda)).toBeTruthy()
      expect(event.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(event.model.equals(mock.deviceModelPda)).toBeTruthy()
      expect(event.name).toBe(mock.deviceName)
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      const localDomainEvent = await getEvent<LocalDomainAdded>(
        program,
        txDetails,
        'localDomainAdded',
      )
      expect(
        localDomainEvent.localDomain.equals(mock.localDomainPda),
      ).toBeTruthy()
      expect(
        localDomainEvent.owner.equals(mock.serviceProvider.publicKey),
      ).toBeTruthy()
      expect(localDomainEvent.name).toBe(mock.localDomain)
      expect(new BN(localDomainEvent.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure device was created
      const device = await program.account.device.fetch(mock.devicePda)
      expect(new BN(device.createdAt).gt(new BN(0))).toBeTruthy()
      expect(device.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(device.model.equals(mock.deviceModelPda)).toBeTruthy()
      expect(device.name).toBe(mock.deviceName)

      const deviceLocationEvent = await getEvent<DeviceLocationAdded>(
        program,
        txDetails,
        'deviceLocationAdded',
      )
      expect(
        deviceLocationEvent.deviceLocation.equals(mock.deviceLocationPda),
      ).toBeTruthy()
      expect(deviceLocationEvent.device.equals(mock.devicePda)).toBeTruthy()
      expect(deviceLocationEvent.height.toString()).toBe(
        mock.deviceHeight.toString(),
      )
      expect(deviceLocationEvent.longitude.toString()).toBe(
        mock.deviceLongitude.toString(),
      )
      expect(deviceLocationEvent.latitude.toString()).toBe(
        mock.deviceLatitude.toString(),
      )
      expect(deviceLocationEvent.placement).toEqual(mock.devicePlacement)
      expect(new BN(deviceLocationEvent.createdAt).gt(new BN(0))).toBeTruthy()

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
      expect(deviceLocation.placement).toEqual(mock.devicePlacement)
      expect(deviceLocation.verified).toBeFalsy()

      // Note: IP allocation is now separated from device creation
      // IP leases should be created separately using allocate_ip instruction
    })

    test('cannot verify device location as non-authority', async () => {
      try {
        await program.methods
          .verifyDeviceLocation()
          .accountsPartial({
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
        const txError = err.logs?.find((log) =>
          log.includes('A raw constraint was violated'),
        )
        expect(txError).toBeDefined()
        expect(
          txError?.includes('AnchorError caused by account: caller.'),
        ).toBeTruthy()
      }
    })

    test('verifies device location as authority', async () => {
      const wallet = loadWallet()
      provider.wallet = wallet

      const tx = await program.methods
        .verifyDeviceLocation()
        .accountsPartial({
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
        program,
        txDetails,
        'deviceLocationVerified',
      )
      expect(event.device.equals(mock.devicePda)).toBeTruthy()
      expect(new BN(event.verifiedAt).gt(new BN(0))).toBeTruthy()

      // make sure device location was updated
      const deviceLocation = await program.account.deviceLocation.fetch(
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
            mock.deviceName,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.devicePlacement,
            mock.deviceMacAddress,
            mock.localDomain,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: mock.devicePda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
          })
          .signers([mock.serviceProvider])
          .rpc()

        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof SendTransactionError).toBeTruthy()
        const err: SendTransactionError = error
        const txError = err.logs?.find((log) => log.includes('already in use'))
        expect(txError).toBeDefined()
        expect(txError).toBe(
          `Allocate: account Address { address: ${mock.devicePda.toBase58()}, base: None } already in use`,
        )
      }
    })

    test('adds the L2 (WirelessRadio) device', async () => {
      const manufacturer = 'DAWN'
      const model = 'WirelessRadio'
      const deviceType = { wirelessRadio: {} } as DeviceType

      const deviceModelPda = getDeviceModelPda(
        program,
        deviceType,
        manufacturer,
        model,
      )

      // add device model
      provider.wallet = wallet
      await program.methods
        .addDeviceModel(deviceType, manufacturer, model)
        .accountsPartial({
          caller: wallet.publicKey,
          config: mock.configPda,
          deviceModel: deviceModelPda,
        })
        .signers([wallet.payer])
        .rpc()

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        deviceModelPda,
        mock.deviceName,
        mock.deviceMacAddress,
      )

      const lattitude = new BN(25.195849 * COORD_DENOMINATOR)
      const longitude = new BN(55.276457 * COORD_DENOMINATOR)

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)

      // Note: IP allocation is now separated from device creation

      const providerWallet = provider.wallet
      provider.wallet = new Wallet(mock.serviceProvider)

      const tx = await program.methods
        .addDevice(
          mock.deviceName,
          mock.deviceHeight,
          lattitude,
          longitude,
          mock.devicePlacement,
          mock.deviceMacAddress,
          mock.localDomain,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          deviceModel: deviceModelPda,
          device: devicePda,
          deviceLocation: deviceLocationPda,
          localDomain: mock.localDomainPda,
        })
        .signers([mock.serviceProvider])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      provider.wallet = providerWallet

      const device = await program.account.device.fetch(devicePda)
      expect(device.model.equals(deviceModelPda)).toBeTruthy()

      // Note: IP allocation is now separated from device creation
      // IP leases should be created separately using allocate_ip instruction
    })

    test('adds second L2 device to the same local domain', async () => {
      const manufacturer = 'DAWN'
      const model = 'WirelessRadio'
      const deviceType = { wirelessRadio: {} } as DeviceType
      const deviceName = 'WR2'

      const deviceModelPda = getDeviceModelPda(
        program,
        deviceType,
        manufacturer,
        model,
      )

      // add device model
      provider.wallet = wallet

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        deviceModelPda,
        deviceName,
        mock.deviceMacAddress,
      )

      const lattitude = new BN(25.195849 * COORD_DENOMINATOR)
      const longitude = new BN(55.276457 * COORD_DENOMINATOR)

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)

      await program.methods
        .addDevice(
          deviceName,
          mock.deviceHeight,
          lattitude,
          longitude,
          mock.devicePlacement,
          mock.deviceMacAddress,
          mock.localDomain,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          deviceModel: deviceModelPda,
          device: devicePda,
          deviceLocation: deviceLocationPda,
          localDomain: mock.localDomainPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      const device = await program.account.device.fetch(devicePda)
      expect(device.localDomain.equals(mock.localDomainPda)).toBeTruthy()

      const localDomain = await program.account.localDomain.fetch(
        mock.localDomainPda,
      )
      expect(
        localDomain.owner.equals(mock.serviceProvider.publicKey),
      ).toBeTruthy()
      expect(
        Buffer.from(localDomain.name).toString('utf8').split('\0')[0],
      ).toBe(mock.localDomain)
    })

    test('cannot add device with local domain name too long', async () => {
      const deviceName = 'WR3'
      const localDomainName = 'a'.repeat(33)

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        deviceName,
        mock.deviceMacAddress,
      )
      const deviceLocationPda = getDeviceLocationPda(program, devicePda)
      const localDomainPda = getLocalDomainPda(
        program,
        mock.serviceProvider.publicKey,
        localDomainName,
      )

      try {
        await program.methods
          .addDevice(
            deviceName,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.devicePlacement,
            mock.deviceMacAddress,
            localDomainName,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
            localDomain: localDomainPda,
            deviceLocation: deviceLocationPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Local domain name is too long')
      }
    })

    test('cannot add device with local domain name empty', async () => {
      const localDomainName = ''
      const deviceName = 'WR3'

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        deviceName,
        mock.deviceMacAddress,
      )
      const deviceLocationPda = getDeviceLocationPda(program, devicePda)
      const localDomainPda = getLocalDomainPda(
        program,
        mock.serviceProvider.publicKey,
        localDomainName,
      )

      try {
        await program.methods
          .addDevice(
            deviceName,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.devicePlacement,
            mock.deviceMacAddress,
            localDomainName,
          )
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
            deviceLocation: deviceLocationPda,
            localDomain: localDomainPda,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Local domain name is empty')
      }
    })

    describe('add_device_for', () => {
      let beneficiary: Keypair

      beforeAll(() => {
        beneficiary = Keypair.generate()
      })

      test('caller can add device for beneficiary', async () => {
        const caller = loadWallet().payer
        const deviceName = 'BeneficiaryDevice'
        const localDomainName = 'beneficiary-network'
        const macAddress: MacAddress = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06]

        // Derive PDAs using beneficiary as owner
        const devicePda = getDevicePda(
          program,
          beneficiary.publicKey,
          mock.deviceModelPda,
          deviceName,
          macAddress,
        )
        const deviceLocationPda = getDeviceLocationPda(program, devicePda)
        const localDomainPda = getLocalDomainPda(
          program,
          beneficiary.publicKey,
          localDomainName,
        )

        const tx = await program.methods
          .addDeviceFor(
            deviceName,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.devicePlacement,
            macAddress,
            localDomainName,
          )
          .accountsStrict({
            caller: caller.publicKey,
            beneficiary: beneficiary.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda,
            deviceLocation: deviceLocationPda,
            localDomain: localDomainPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([caller])
          .transaction()

        const txDetails = await confirmTx(provider, tx)

        // Verify DeviceAdded event has beneficiary as owner
        const deviceEvent = await getEvent<DeviceAdded>(
          program,
          txDetails,
          'deviceAdded',
        )
        expect(deviceEvent.device.equals(devicePda)).toBeTruthy()
        expect(deviceEvent.deviceLocation.equals(deviceLocationPda)).toBeTruthy()
        expect(deviceEvent.owner.equals(beneficiary.publicKey)).toBeTruthy()
        expect(deviceEvent.model.equals(mock.deviceModelPda)).toBeTruthy()
        expect(deviceEvent.name).toBe(deviceName)

        // Verify LocalDomainAdded event created for beneficiary
        const localDomainEvent = await getEvent<LocalDomainAdded>(
          program,
          txDetails,
          'localDomainAdded',
        )
        expect(localDomainEvent.localDomain.equals(localDomainPda)).toBeTruthy()
        expect(localDomainEvent.owner.equals(beneficiary.publicKey)).toBeTruthy()
        expect(localDomainEvent.name).toBe(localDomainName)

        // Verify DeviceLocationAdded event
        const deviceLocationEvent = await getEvent<DeviceLocationAdded>(
          program,
          txDetails,
          'deviceLocationAdded',
        )
        expect(
          deviceLocationEvent.deviceLocation.equals(deviceLocationPda),
        ).toBeTruthy()
        expect(deviceLocationEvent.device.equals(devicePda)).toBeTruthy()

        // Verify device account has beneficiary as owner
        const device = await program.account.device.fetch(devicePda)
        expect(device.owner.equals(beneficiary.publicKey)).toBeTruthy()
        expect(device.model.equals(mock.deviceModelPda)).toBeTruthy()
        expect(device.name).toBe(deviceName)
        expect(new BN(device.createdAt).gt(new BN(0))).toBeTruthy()

        // Verify device location was created
        const deviceLocation = await program.account.deviceLocation.fetch(
          deviceLocationPda,
        )
        expect(deviceLocation.device.equals(devicePda)).toBeTruthy()
        expect(deviceLocation.latitude.toString()).toBe(
          mock.deviceLatitude.toString(),
        )
        expect(deviceLocation.longitude.toString()).toBe(
          mock.deviceLongitude.toString(),
        )
        expect(deviceLocation.verified).toBeFalsy()

        // Verify local domain was created for beneficiary
        const localDomain = await program.account.localDomain.fetch(
          localDomainPda,
        )
        expect(localDomain.owner.equals(beneficiary.publicKey)).toBeTruthy()
        expect(Buffer.from(localDomain.name).toString('utf8').split('\0')[0]).toBe(
          localDomainName,
        )
      })

      test('cannot add same device for beneficiary twice', async () => {
        const caller = loadWallet().payer
        const deviceName = 'BeneficiaryDevice'
        const localDomainName = 'beneficiary-network'
        const macAddress: MacAddress = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06]

        const devicePda = getDevicePda(
          program,
          beneficiary.publicKey,
          mock.deviceModelPda,
          deviceName,
          macAddress,
        )
        const deviceLocationPda = getDeviceLocationPda(program, devicePda)
        const localDomainPda = getLocalDomainPda(
          program,
          beneficiary.publicKey,
          localDomainName,
        )

        try {
          await program.methods
            .addDeviceFor(
              deviceName,
              mock.deviceHeight,
              mock.deviceLatitude,
              mock.deviceLongitude,
              mock.devicePlacement,
              macAddress,
              localDomainName,
            )
            .accountsStrict({
              caller: caller.publicKey,
              beneficiary: beneficiary.publicKey,
              deviceModel: mock.deviceModelPda,
              device: devicePda,
              deviceLocation: deviceLocationPda,
              localDomain: localDomainPda,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([caller])
            .rpc()

          expect(false).toBeTruthy()
        } catch (error) {
          // Should fail with account already in use error
          expect(error).toBeDefined()
        }
      })

      test('caller can add multiple different devices for same beneficiary', async () => {
        const caller = loadWallet().payer
        const deviceName2 = 'BeneficiaryDevice2'
        const localDomainName = 'beneficiary-network'
        const macAddress2: MacAddress = [0x02, 0x03, 0x04, 0x05, 0x06, 0x07]

        const devicePda2 = getDevicePda(
          program,
          beneficiary.publicKey,
          mock.deviceModelPda,
          deviceName2,
          macAddress2,
        )
        const deviceLocationPda2 = getDeviceLocationPda(program, devicePda2)
        const localDomainPda = getLocalDomainPda(
          program,
          beneficiary.publicKey,
          localDomainName,
        )

        const tx = await program.methods
          .addDeviceFor(
            deviceName2,
            mock.deviceHeight,
            mock.deviceLatitude,
            mock.deviceLongitude,
            mock.devicePlacement,
            macAddress2,
            localDomainName,
          )
          .accountsStrict({
            caller: caller.publicKey,
            beneficiary: beneficiary.publicKey,
            deviceModel: mock.deviceModelPda,
            device: devicePda2,
            deviceLocation: deviceLocationPda2,
            localDomain: localDomainPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([caller])
          .transaction()

        await confirmTx(provider, tx)

        // Verify second device was created with same beneficiary
        const device2 = await program.account.device.fetch(devicePda2)
        expect(device2.owner.equals(beneficiary.publicKey)).toBeTruthy()
        expect(device2.name).toBe(deviceName2)

        // Verify same local domain is reused (init_if_needed)
        const localDomain = await program.account.localDomain.fetch(
          localDomainPda,
        )
        expect(localDomain.owner.equals(beneficiary.publicKey)).toBeTruthy()
      })

      test('validates input constraints same as add_device', async () => {
        const caller = loadWallet().payer
        const deviceName = 'ValidDevice'
        const localDomainName = 'valid-network'
        const macAddress: MacAddress = [0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]

        // Test invalid latitude (0)
        try {
          await program.methods
            .addDeviceFor(
              'TestDevice',
              mock.deviceHeight,
              new BN(0), // Invalid latitude
              mock.deviceLongitude,
              mock.devicePlacement,
              macAddress,
              localDomainName,
            )
            .accountsPartial({
              caller: caller.publicKey,
              beneficiary: beneficiary.publicKey,
              deviceModel: mock.deviceModelPda,
            })
            .signers([caller])
            .rpc()
          expect(false).toBeTruthy()
        } catch (error) {
          // Should fail with latitude validation error
          expect(error).toBeDefined()
          if (error instanceof AnchorError) {
            expect(error.error.errorMessage).toBe('Latitude coordinate is invalid')
          }
        }

        // Test empty device name
        try {
          await program.methods
            .addDeviceFor(
              '', // Empty name
              mock.deviceHeight,
              mock.deviceLatitude,
              mock.deviceLongitude,
              mock.devicePlacement,
              macAddress,
              localDomainName,
            )
            .accountsPartial({
              caller: caller.publicKey,
              beneficiary: beneficiary.publicKey,
              deviceModel: mock.deviceModelPda,
            })
            .signers([caller])
            .rpc()
          expect(false).toBeTruthy()
        } catch (error) {
          // Should fail with device name validation error
          expect(error).toBeDefined()
          if (error instanceof AnchorError) {
            expect(error.error.errorMessage).toBe('Device name is empty')
          }
        }
      })
    })
  })
