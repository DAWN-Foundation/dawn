import * as anchor from '@coral-xyz/anchor'
import { Program, AnchorError, Wallet, BN } from '@coral-xyz/anchor'
import {
  MAX_SEED_LENGTH,
  PublicKey,
  SendTransactionError,
} from '@solana/web3.js'

import { Dawn } from '../../target/types/dawn'
import {
  getEvent,
  mock,
  getProvider,
  confirmTx,
  loadWallet,
  DeviceType,
  getDeviceModelPda,
} from '../../sdk/utils'
import { beforeAll, expect } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'

/// Maximum length of a device model
const MAX_DEVICE_MODEL_LEN = 64

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

      program = anchor.workspace.DAWN as Program<Dawn>
    })

    test('mock setup', () => {
      expect(mock).toBeDefined()
    })

    test('cannot add device model by non-authority', async () => {
      provider.wallet = new Wallet(mock.serviceProvider)

      try {
        await program.methods
          .addDeviceModel(
            mock.deviceType,
            mock.deviceManufacturer,
            mock.deviceModel,
          )
          .accountsPartial({
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
          .accountsPartial({
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
          .accountsPartial({
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
        manufacturer,
        mock.deviceModel,
      )

      try {
        await program.methods
          .addDeviceModel(mock.deviceType, manufacturer, mock.deviceModel)
          .accountsPartial({
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
        model,
      )

      try {
        await program.methods
          .addDeviceModel(mock.deviceType, mock.deviceManufacturer, model)
          .accountsPartial({
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
        manufacturer,
        mock.deviceModel,
      )

      try {
        await program.methods
          .addDeviceModel(mock.deviceType, manufacturer, mock.deviceModel)
          .accountsPartial({
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
        model,
      )

      try {
        await program.methods
          .addDeviceModel(mock.deviceType, mock.deviceManufacturer, model)
          .accountsPartial({
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
        .accountsPartial({
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
        'deviceModelAdded',
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
          .accountsPartial({
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
        .accountsPartial({
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
        'deviceModelAdded',
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

    test('collision prevention: long manufacturer strings that differ after 32 chars produce different PDAs', async () => {
      // Test case: Two manufacturer strings that would collide with truncation
      // but produce different PDAs with hashing
      const manufacturer1 = 'a'.repeat(32) + 'X'
      const manufacturer2 = 'a'.repeat(32) + 'Y'
      const model = 'TestModel'

      const deviceModelPda1 = getDeviceModelPda(
        program,
        mock.deviceType,
        manufacturer1,
        model,
      )
      const deviceModelPda2 = getDeviceModelPda(
        program,
        mock.deviceType,
        manufacturer2,
        model,
      )

      // With truncation, these would be the same. With hashing, they should be different.
      expect(deviceModelPda1.equals(deviceModelPda2)).toBeFalsy()

      // Create first device model
      const tx1 = await program.methods
        .addDeviceModel(mock.deviceType, manufacturer1, model)
        .accountsPartial({
          caller: wallet.publicKey,
          config: mock.configPda,
          deviceModel: deviceModelPda1,
        })
        .signers([wallet.payer])
        .transaction()

      await confirmTx(provider, tx1)

      // Try to create second device model - should succeed (different PDA)
      const tx2 = await program.methods
        .addDeviceModel(mock.deviceType, manufacturer2, model)
        .accountsPartial({
          caller: wallet.publicKey,
          config: mock.configPda,
          deviceModel: deviceModelPda2,
        })
        .signers([wallet.payer])
        .transaction()

      await confirmTx(provider, tx2)

      // Verify both device models exist
      const deviceModel1 = await program.account.deviceModel.fetch(
        deviceModelPda1,
      )
      const deviceModel2 = await program.account.deviceModel.fetch(
        deviceModelPda2,
      )

      expect(deviceModel1.manufacturer).toBe(manufacturer1.trim())
      expect(deviceModel2.manufacturer).toBe(manufacturer2.trim())
    })

    test('collision prevention: long model strings that differ after 32 chars produce different PDAs', async () => {
      // Test case: Two model strings that would collide with truncation
      const manufacturer = 'TestManufacturer'
      const model1 = 'b'.repeat(32) + 'X'
      const model2 = 'b'.repeat(32) + 'Y'

      const deviceModelPda1 = getDeviceModelPda(
        program,
        mock.deviceType,
        manufacturer,
        model1,
      )
      const deviceModelPda2 = getDeviceModelPda(
        program,
        mock.deviceType,
        manufacturer,
        model2,
      )

      // With truncation, these would be the same. With hashing, they should be different.
      expect(deviceModelPda1.equals(deviceModelPda2)).toBeFalsy()

      // Create first device model
      const tx1 = await program.methods
        .addDeviceModel(mock.deviceType, manufacturer, model1)
        .accountsPartial({
          caller: wallet.publicKey,
          config: mock.configPda,
          deviceModel: deviceModelPda1,
        })
        .signers([wallet.payer])
        .transaction()

      await confirmTx(provider, tx1)

      // Try to create second device model - should succeed (different PDA)
      const tx2 = await program.methods
        .addDeviceModel(mock.deviceType, manufacturer, model2)
        .accountsPartial({
          caller: wallet.publicKey,
          config: mock.configPda,
          deviceModel: deviceModelPda2,
        })
        .signers([wallet.payer])
        .transaction()

      await confirmTx(provider, tx2)

      // Verify both device models exist
      const deviceModel1 = await program.account.deviceModel.fetch(
        deviceModelPda1,
      )
      const deviceModel2 = await program.account.deviceModel.fetch(
        deviceModelPda2,
      )

      expect(deviceModel1.model).toBe(model1.trim())
      expect(deviceModel2.model).toBe(model2.trim())
    })

    test('whitespace handling: leading/trailing whitespace produces same PDA as trimmed version', async () => {
      // Use unique values to avoid conflicts with existing device models
      const manufacturer = 'WhitespaceTestManufacturer'
      const model = 'WhitespaceTestModel'
      const manufacturerWithWhitespace = '  ' + manufacturer + '  '
      const modelWithWhitespace = '  ' + model + '  '

      const deviceModelPda1 = getDeviceModelPda(
        program,
        mock.deviceType,
        manufacturer,
        model,
      )
      const deviceModelPda2 = getDeviceModelPda(
        program,
        mock.deviceType,
        manufacturerWithWhitespace,
        modelWithWhitespace,
      )

      // Should produce the same PDA since hashStringSeed trims
      expect(deviceModelPda1.equals(deviceModelPda2)).toBeTruthy()

      // Create device model with whitespace
      const tx = await program.methods
        .addDeviceModel(
          mock.deviceType,
          manufacturerWithWhitespace,
          modelWithWhitespace,
        )
        .accountsPartial({
          caller: wallet.publicKey,
          config: mock.configPda,
          deviceModel: deviceModelPda1,
        })
        .signers([wallet.payer])
        .transaction()

      await confirmTx(provider, tx)

      // Verify device model was created with trimmed values
      const deviceModel = await program.account.deviceModel.fetch(
        deviceModelPda1,
      )
      expect(deviceModel.manufacturer).toBe(manufacturer)
      expect(deviceModel.model).toBe(model)
    })

    test('case sensitivity: different case produces different PDAs', async () => {
      // Use unique values to avoid conflicts with existing device models
      const manufacturer1 = 'CaseTestManufacturer'
      const manufacturer2 = 'casetestmanufacturer'
      const model = 'CaseTestModel'

      const deviceModelPda1 = getDeviceModelPda(
        program,
        mock.deviceType,
        manufacturer1,
        model,
      )
      const deviceModelPda2 = getDeviceModelPda(
        program,
        mock.deviceType,
        manufacturer2,
        model,
      )

      // Case differences should produce different PDAs
      expect(deviceModelPda1.equals(deviceModelPda2)).toBeFalsy()

      // Create first device model
      const tx1 = await program.methods
        .addDeviceModel(mock.deviceType, manufacturer1, model)
        .accountsPartial({
          caller: wallet.publicKey,
          config: mock.configPda,
          deviceModel: deviceModelPda1,
        })
        .signers([wallet.payer])
        .transaction()

      await confirmTx(provider, tx1)

      // Try to create second device model - should succeed (different PDA)
      const tx2 = await program.methods
        .addDeviceModel(mock.deviceType, manufacturer2, model)
        .accountsPartial({
          caller: wallet.publicKey,
          config: mock.configPda,
          deviceModel: deviceModelPda2,
        })
        .signers([wallet.payer])
        .transaction()

      await confirmTx(provider, tx2)

      // Verify both device models exist
      const deviceModel1 = await program.account.deviceModel.fetch(
        deviceModelPda1,
      )
      const deviceModel2 = await program.account.deviceModel.fetch(
        deviceModelPda2,
      )

      expect(deviceModel1.manufacturer).toBe(manufacturer1)
      expect(deviceModel2.manufacturer).toBe(manufacturer2)
    })
  })
