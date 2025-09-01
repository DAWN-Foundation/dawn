import * as anchor from '@coral-xyz/anchor'
import { Program, AnchorError, Wallet, BN } from '@coral-xyz/anchor'
import { Keypair, PublicKey, SendTransactionError } from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import {
  getEvent,
  mock,
  getProvider,
  confirmTx,
  COORD_DENOMINATOR,
  loadWallet,
  getDevicePda,
  getDeviceLocationPda,
  MacAddress,
  getDeviceModelPda,
  DeviceType,
  getOrganizationPda,
  getLocalDomainPda,
  getIpLeasePda,
} from '../../sdk/utils'
import { beforeAll, expect } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'

interface DeviceAdded {
  device: PublicKey
  deviceLocation: PublicKey
  owner: PublicKey
  site: PublicKey
  model: PublicKey
  organization: PublicKey
  name: string
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
            organization: mock.organizationPda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: mock.loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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
            organization: mock.organizationPda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: mock.loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
          })
          .signers([mock.serviceProvider])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        console.log('my error', error)
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
            organization: mock.organizationPda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: mock.loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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
            organization: mock.organizationPda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: mock.loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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
      const loopbackIpLeasePda = getIpLeasePda(1, devicePda)

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
            organization: mock.organizationPda,
            localDomain: mock.localDomainPda,
            deviceLocation: deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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
      const loopbackIpLeasePda = getIpLeasePda(1, devicePda)

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
            organization: mock.organizationPda,
            localDomain: mock.localDomainPda,
            deviceLocation: deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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
            organization: mock.organizationPda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: mock.loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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
            organization: mock.organizationPda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: mock.loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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
            organization: mock.organizationPda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: mock.loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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
            organization: mock.organizationPda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: mock.loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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
          organization: mock.organizationPda,
          deviceLocation: mock.deviceLocationPda,
          site: null,
          localDomain: mock.localDomainPda,
          rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
          loopbackIpBlock: mock.loopbackIpBlockPda,
          loopbackIpLease: mock.loopbackIpLeasePda,
          rootPtpIpBlock: null,
          ptpIpBlock: null,
          ptpIpLease: null,
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
      expect(event.organization.equals(mock.organizationPda)).toBeTruthy()
      expect(event.name).toBe(mock.deviceName)
      expect(event.latitude.toString()).toBe(mock.deviceLatitude.toString())
      expect(event.longitude.toString()).toBe(mock.deviceLongitude.toString())
      expect(event.height.toString()).toBe(mock.deviceHeight.toString())
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure device was created
      const device = await program.account.device.fetch(mock.devicePda)
      expect(new BN(device.createdAt).gt(new BN(0))).toBeTruthy()
      expect(device.owner.equals(mock.serviceProvider.publicKey)).toBeTruthy()
      expect(device.model.equals(mock.deviceModelPda)).toBeTruthy()
      expect(device.organization.equals(mock.organizationPda)).toBeTruthy()
      expect(device.name).toBe(mock.deviceName)

      // make sure organization was created
      const organization = await program.account.organization.fetch(
        mock.organizationPda,
      )
      expect(new BN(organization.createdAt).gt(new BN(0))).toBeTruthy()
      expect(
        organization.owner.equals(mock.serviceProvider.publicKey),
      ).toBeTruthy()
      expect(organization.name).toBe('end_user_organization')

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

      // make sure IP lease was created for loopback
      const ipLease = await program.account.ipLease.fetch(
        mock.loopbackIpLeasePda,
      )
      expect(ipLease.device.equals(mock.devicePda)).toBeTruthy()
      expect(ipLease.tier).toEqual({ loopback: {} })
      expect(ipLease.ipV4CidrMask).toBe(32) // /32 for loopback
      expect(ipLease.ipv4.length).toBe(4) // IPv4 address
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
            organization: mock.organizationPda,
            localDomain: mock.localDomainPda,
            deviceLocation: mock.deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: mock.loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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

      // Get IPAM PDAs for this specific device
      const loopbackIpLeasePda = getIpLeasePda(1, devicePda)
      const ptpIpLeasePda = getIpLeasePda(2, devicePda)

      await program.methods
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
          organization: mock.organizationPda,
          deviceLocation: deviceLocationPda,
          site: null,
          localDomain: mock.localDomainPda,
          rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
          loopbackIpBlock: mock.loopbackIpBlockPda,
          loopbackIpLease: loopbackIpLeasePda,
          rootPtpIpBlock: mock.rootPtpIpBlockPda,
          ptpIpBlock: mock.ptpIpBlockPda,
          ptpIpLease: ptpIpLeasePda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      const device = await program.account.device.fetch(devicePda)
      expect(device.model.equals(deviceModelPda)).toBeTruthy()

      // Verify both loopback and PtP IP leases were created for WirelessRadio
      const loopbackLease = await program.account.ipLease.fetch(
        loopbackIpLeasePda,
      )
      expect(loopbackLease.device.equals(devicePda)).toBeTruthy()
      expect(loopbackLease.tier).toEqual({ loopback: {} })
      expect(loopbackLease.ipV4CidrMask).toBe(32)

      const ptpLease = await program.account.ipLease.fetch(ptpIpLeasePda)
      expect(ptpLease.device.equals(devicePda)).toBeTruthy()
      expect(ptpLease.tier).toEqual({ ptP: {} })
      expect(ptpLease.ipV4CidrMask).toBe(31) // /31 for PtP
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

      // Get IPAM PDAs for this specific device
      const loopbackIpLeasePda = getIpLeasePda(1, devicePda)
      const ptpIpLeasePda = getIpLeasePda(2, devicePda)

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
          organization: mock.organizationPda,
          deviceLocation: deviceLocationPda,
          site: null,
          localDomain: mock.localDomainPda,
          rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
          loopbackIpBlock: mock.loopbackIpBlockPda,
          loopbackIpLease: loopbackIpLeasePda,
          rootPtpIpBlock: mock.rootPtpIpBlockPda,
          ptpIpBlock: mock.ptpIpBlockPda,
          ptpIpLease: ptpIpLeasePda,
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
      const loopbackIpLeasePda = getIpLeasePda(1, devicePda)
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
            organization: mock.organizationPda,
            localDomain: localDomainPda,
            deviceLocation: deviceLocationPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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

      const loopbackIpLeasePda = getIpLeasePda(1, devicePda)

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
            organization: mock.organizationPda,
            deviceLocation: deviceLocationPda,
            localDomain: localDomainPda,
            site: null,
            rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
            loopbackIpBlock: mock.loopbackIpBlockPda,
            loopbackIpLease: loopbackIpLeasePda,
            rootPtpIpBlock: null,
            ptpIpBlock: null,
            ptpIpLease: null,
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
  })

export const deviceSiteTests = () =>
  describe('dawn::device_site', () => {
    let program: Program<Dawn>
    let provider: BankrunProvider

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = new Wallet(mock.serviceProvider)

      anchor.setProvider(provider)

      program = anchor.workspace.DAWN as Program<Dawn>
    })

    test('mock setup', () => {
      expect(mock).toBeDefined()
    })

    test('cannot assign device to site if site is not owned by caller', async () => {
      const wallet = loadWallet()
      provider.wallet = wallet

      const devicePda = getDevicePda(
        program,
        wallet.payer,
        mock.deviceModelPda,
        mock.deviceName,
        mock.deviceMacAddress,
      )

      const organizationPda = getOrganizationPda(
        program,
        wallet.publicKey,
        { endUser: {} },
        'end_user_organization',
      )
      const deviceLocationPda = getDeviceLocationPda(program, devicePda)
      const loopbackIpLeasePda = getIpLeasePda(1, devicePda)
      const localDomainPda = getLocalDomainPda(
        program,
        wallet.publicKey,
        mock.localDomain,
      )

      // add device
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
          caller: wallet.publicKey,
          deviceModel: mock.deviceModelPda,
          device: devicePda,
          organization: organizationPda,
          localDomain: localDomainPda,
          deviceLocation: deviceLocationPda,
          site: null,
          rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
          loopbackIpBlock: mock.loopbackIpBlockPda,
          loopbackIpLease: loopbackIpLeasePda,
          rootPtpIpBlock: null,
          ptpIpBlock: null,
          ptpIpLease: null,
        })
        .signers([wallet.payer])
        .rpc()

      // cannot assign to the site owned by serviceProvider
      try {
        await program.methods
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
        'deviceAssignedToSite',
      )
      expect(event.device.equals(mock.devicePda)).toBeTruthy()
      expect(event.site.equals(mock.sitePda)).toBeTruthy()
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure device was updated
      const device = await program.account.device.fetch(mock.devicePda)
      expect(device.site?.equals(mock.sitePda)).toBeTruthy()
    })

    test('can add device with site', async () => {
      const macAddress: MacAddress = [0, 0, 0, 0, 0, 1]

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        mock.deviceName,
        macAddress,
      )

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)
      const loopbackIpLeasePda = getIpLeasePda(1, devicePda)

      const tx = await program.methods
        .addDevice(
          mock.deviceName,
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.devicePlacement,
          macAddress,
          mock.localDomain,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          deviceModel: mock.deviceModelPda,
          device: devicePda,
          organization: mock.organizationPda,
          localDomain: mock.localDomainPda,
          deviceLocation: deviceLocationPda,
          site: mock.sitePda,
          rootLoopbackIpBlock: mock.rootLoopbackIpBlockPda,
          loopbackIpBlock: mock.loopbackIpBlockPda,
          loopbackIpLease: loopbackIpLeasePda,
          rootPtpIpBlock: null,
          ptpIpBlock: null,
          ptpIpLease: null,
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
      expect(event.device.equals(devicePda)).toBeTruthy()
      expect(event.site.equals(mock.sitePda)).toBeTruthy()
      expect(event.model.equals(mock.deviceModelPda)).toBeTruthy()
      expect(event.organization.equals(mock.organizationPda)).toBeTruthy()
      expect(event.latitude.toString()).toBe(mock.deviceLatitude.toString())
      expect(event.longitude.toString()).toBe(mock.deviceLongitude.toString())
      expect(event.macAddress).toEqual(macAddress)
    })
  })
