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
  COORD_DENOMINATOR,
  loadWallet,
  DeviceType,
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'
import { BanksClient } from 'solana-bankrun'
import { BankrunProvider } from 'anchor-bankrun'

/// Maximum length of a device model
const MAX_DEVICE_MODEL_LEN = 32

/// Maximum length of a device manufacturer
const MAX_DEVICE_MANUFACTURER_LEN = 64

export const DEVICE_MODEL_SIZE =
  8 + // id
  1 + // device_type
  (4 + MAX_DEVICE_MANUFACTURER_LEN) + // manufacturer
  (4 + MAX_DEVICE_MODEL_LEN) + // model
  1 // bump

interface DeviceModelAdded {
  deviceModel: PublicKey
  deviceType: DeviceType
  manufacturer: string
  model: string
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
        expect(err.error.errorMessage).toBe('A raw constraint was violated')
      } finally {
        provider.wallet = loadWallet()
      }
    })

    test('cannot add device model with an empty manufacturer', async () => {
      const manufacturer = '  '

      const [deviceModelPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device_model'),
          Buffer.from(manufacturer.trim()),
          Buffer.from(mock.deviceModel),
        ],
        program.programId,
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

      const [deviceModelPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device_model'),
          Buffer.from(mock.deviceManufacturer),
          Buffer.from(model.trim()),
        ],
        program.programId,
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

      const [deviceModelPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device_model'),
          Buffer.from(manufacturer.substring(0, MAX_SEED_LENGTH)),
          Buffer.from(mock.deviceModel),
        ],
        program.programId,
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

      const [deviceModelPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('device_model'),
          Buffer.from(mock.deviceManufacturer),
          Buffer.from(model.substring(0, MAX_SEED_LENGTH)),
        ],
        program.programId,
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
  })
