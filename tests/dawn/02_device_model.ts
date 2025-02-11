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
  loadWallet,
  DeviceType,
  deviceTypeSeed,
  getDeviceModelPda,
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'
import { BanksClient } from 'solana-bankrun'
import { BankrunProvider } from 'anchor-bankrun'

/// Maximum length of a device model
const MAX_DEVICE_MODEL_LEN = 32

/// Maximum length of a device manufacturer
const MAX_DEVICE_MANUFACTURER_LEN = 64

interface DeviceModelAdded {
  deviceModel: PublicKey
  deviceType: DeviceType
  manufacturer: string
  model: string
  createdAt: number
}

export const deviceModelTests = () =>
  describe('dawn::device_model', () => {
    const wallet = loadWallet()

    let program: Program<Dawn>
    let provider: BankrunProvider

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = wallet

      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)
    })

    test('mock setup', () => {
      expect(mock).toBeDefined()
    })

    test('cannot add device model by non-authority', async () => {
      provider.wallet = new Wallet(mock.serviceProvider)
      const program2 = new Program<Dawn>(IDL, PROGRAM_ID, provider)

      try {
        await program2.methods
          .addDeviceModel(
            mock.deviceType,
            mock.deviceManufacturer,
            mock.deviceModel,
          )
          .accounts({
            caller: mock.serviceProvider.publicKey,
            config: mock.configPda,
            deviceModel: mock.deviceModelPda,
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
      } finally {
        provider.wallet = loadWallet()
      }
    })

    test('cannot add device model with non-existing device type', async () => {
      const deviceType = { other: {} }

      const deviceModelPda = getDeviceModelPda(
        program,
        [2],
        mock.deviceManufacturer,
        mock.deviceModel,
      )

      try {
        await program.methods
          .addDeviceModel(
            deviceType as any,
            mock.deviceManufacturer,
            mock.deviceModel,
          )
          .accounts({
            caller: wallet.publicKey,
            config: mock.configPda,
            deviceModel: deviceModelPda,
          })
          .signers([wallet.payer])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof Error).toBeTruthy()
        const err: Error = error
        expect(err.message).toBe('unable to infer src variant')
      }
    })

    test('cannot add device model with device type not matching PDA', async () => {
      const deviceType = { wirelessRadio: {} }

      try {
        await program.methods
          .addDeviceModel(deviceType, mock.deviceManufacturer, mock.deviceModel)
          .accounts({
            caller: wallet.publicKey,
            config: mock.configPda,
            deviceModel: mock.deviceModelPda,
          })
          .signers([wallet.payer])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('A seeds constraint was violated')
      }
    })

    test('cannot add device model with an empty manufacturer', async () => {
      const manufacturer = '  '

      const deviceModelPda = getDeviceModelPda(
        program,
        mock.deviceType,
        manufacturer.trim(),
        mock.deviceModel,
      )

      try {
        await program.methods
          .addDeviceModel(mock.deviceType, manufacturer, mock.deviceModel)
          .accounts({
            caller: wallet.publicKey,
            config: mock.configPda,
            deviceModel: deviceModelPda,
          })
          .signers([wallet.payer])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Device manufacturer is empty')
      }
    })

    test('cannot add device model with an empty model', async () => {
      const model = '  '

      const deviceModelPda = getDeviceModelPda(
        program,
        mock.deviceType,
        mock.deviceManufacturer,
        model.trim(),
      )

      try {
        await program.methods
          .addDeviceModel(mock.deviceType, mock.deviceManufacturer, model)
          .accounts({
            caller: wallet.publicKey,
            config: mock.configPda,
            deviceModel: deviceModelPda,
          })
          .signers([wallet.payer])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Device model is empty')
      }
    })

    test('cannot add device model with manufacturer exceeding MAX_DEVICE_MANUFACTURER_LEN', async () => {
      const manufacturer = 'a'.repeat(MAX_DEVICE_MANUFACTURER_LEN + 1)

      const deviceModelPda = getDeviceModelPda(
        program,
        mock.deviceType,
        manufacturer.substring(0, MAX_SEED_LENGTH),
        mock.deviceModel,
      )

      try {
        await program.methods
          .addDeviceModel(mock.deviceType, manufacturer, mock.deviceModel)
          .accounts({
            caller: wallet.publicKey,
            config: mock.configPda,
            deviceModel: deviceModelPda,
          })
          .signers([wallet.payer])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Device manufacturer is too long')
      }
    })

    test('cannot add device model with model exceeding MAX_DEVICE_MODEL_LEN', async () => {
      const model = 'a'.repeat(MAX_DEVICE_MODEL_LEN + 1)

      const deviceModelPda = getDeviceModelPda(
        program,
        mock.deviceType,
        mock.deviceManufacturer,
        model.substring(0, MAX_SEED_LENGTH),
      )

      try {
        await program.methods
          .addDeviceModel(mock.deviceType, mock.deviceManufacturer, model)
          .accounts({
            caller: wallet.publicKey,
            config: mock.configPda,
            deviceModel: deviceModelPda,
          })
          .signers([wallet.payer])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Device model is too long')
      }
    })

    test('adds the device model', async () => {
      const tx = await program.methods
        .addDeviceModel(
          mock.deviceType,
          mock.deviceManufacturer,
          mock.deviceModel,
        )
        .accounts({
          caller: wallet.publicKey,
          config: mock.configPda,
          deviceModel: mock.deviceModelPda,
        })
        .signers([wallet.payer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      const deviceModel = await program.account.deviceModel.fetch(
        mock.deviceModelPda,
      )
      expect(new BN(deviceModel.createdAt).gt(new BN(0))).toBeTruthy()
      expect(deviceModel.manufacturer).toBe(mock.deviceManufacturer)
      expect(deviceModel.model).toBe(mock.deviceModel)

      // make sure event was emitted
      const event = await getEvent<DeviceModelAdded>(
        program,
        txDetails,
        'DeviceModelAdded',
      )

      expect(event.manufacturer).toBe(mock.deviceManufacturer)
      expect(event.model).toBe(mock.deviceModel)
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()
    })

    // given previous case created this device
    test('cannot add the same device model twice', async () => {
      // small wait to ensure previous tx is processed
      await new Promise((resolve) => setTimeout(resolve, 100))

      try {
        await program.methods
          .addDeviceModel(
            mock.deviceType,
            mock.deviceManufacturer,
            mock.deviceModel,
          )
          .accounts({
            caller: wallet.publicKey,
            config: mock.configPda,
            deviceModel: mock.deviceModelPda,
          })
          .signers([wallet.payer])
          .rpc()

        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof SendTransactionError).toBeTruthy()
        const err: SendTransactionError = error
        const txError = err.logs.find((log) => log.includes('already in use'))
        expect(txError).toBeDefined()
        expect(txError).toBe(
          `Allocate: account Address { address: ${mock.deviceModelPda.toBase58()}, base: None } already in use`,
        )
      }
    })

    test('can add device model with same manufacturer and model but different device type', async () => {
      const deviceType = { wirelessRadio: {} }

      const deviceModelPda = getDeviceModelPda(
        program,
        deviceType,
        mock.deviceManufacturer,
        mock.deviceModel,
      )

      const tx = await program.methods
        .addDeviceModel(deviceType, mock.deviceManufacturer, mock.deviceModel)
        .accounts({
          caller: wallet.publicKey,
          config: mock.configPda,
          deviceModel: deviceModelPda,
        })
        .signers([wallet.payer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<DeviceModelAdded>(
        program,
        txDetails,
        'DeviceModelAdded',
      )
      expect(event.manufacturer).toBe(mock.deviceManufacturer)
      expect(event.model).toBe(mock.deviceModel)
      expect(event.deviceType).toStrictEqual(deviceType)
      expect(new BN(event.createdAt).gt(new BN(0))).toBeTruthy()

      // make sure account was created
      const deviceModel = await program.account.deviceModel.fetch(
        deviceModelPda,
      )
      expect(new BN(deviceModel.createdAt).gt(new BN(0))).toBeTruthy()
      expect(deviceModel.manufacturer).toBe(mock.deviceManufacturer)
      expect(deviceModel.model).toBe(mock.deviceModel)
      expect(deviceModel.deviceType).toStrictEqual(deviceType)
    })
  })
