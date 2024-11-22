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
  deviceTypeSeed,
  IpBytes,
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'
import { BanksClient } from 'solana-bankrun'
import { BankrunProvider } from 'anchor-bankrun'

/// Maximum length of a device model
const MAX_DEVICE_MODEL_LEN = 32

/// Maximum length of a device manufacturer
const MAX_DEVICE_MANUFACTURER_LEN = 64

interface IpPoolAdded {
  rangeStart: IpBytes
  rangeEnd: IpBytes
}

export const ipPoolTests = () =>
  describe('dawn::ip_pool', () => {
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

    test('cannot add ip pool by non-authority', async () => {
      provider.wallet = new Wallet(mock.serviceProvider)
      const program2 = new Program<Dawn>(IDL, PROGRAM_ID, provider)

      try {
        await program2.methods
          .addIpPool(mock.ipPoolRangeStart, mock.ipPoolRangeEnd)
          .accounts({
            caller: mock.serviceProvider.publicKey,
            config: mock.configPda,
            ipPool: mock.ipPoolPda,
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

    test('cannot add ip pool with range start of 0.0.0.0', async () => {
      const rangeStart = [0, 0, 0, 0]

      const [ipPoolPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('ip_pool'),
          Buffer.from(rangeStart),
          Buffer.from(mock.ipPoolRangeEnd),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addIpPool(rangeStart, mock.ipPoolRangeEnd)
          .accounts({
            caller: wallet.publicKey,
            config: mock.configPda,
            ipPool: ipPoolPda,
          })
          .signers([wallet.payer])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid IP pool range')
      }
    })

    test('cannot add ip pool with range end of 0.0.0.0', async () => {
      const rangeEnd = [0, 0, 0, 0]

      const [ipPoolPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('ip_pool'),
          Buffer.from(mock.ipPoolRangeStart),
          Buffer.from(rangeEnd),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addIpPool(mock.ipPoolRangeStart, rangeEnd)
          .accounts({
            caller: wallet.publicKey,
            config: mock.configPda,
            ipPool: ipPoolPda,
          })
          .signers([wallet.payer])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid IP pool range')
      }
    })

    test('adds the ip pool', async () => {
      const tx = await program.methods
        .addIpPool(mock.ipPoolRangeStart, mock.ipPoolRangeEnd)
        .accounts({
          caller: wallet.publicKey,
          config: mock.configPda,
          ipPool: mock.ipPoolPda,
        })
        .signers([wallet.payer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // make sure event was emitted
      const event = await getEvent<IpPoolAdded>(
        program,
        txDetails,
        'IpPoolAdded',
      )
      expect(event.rangeStart).toStrictEqual(mock.ipPoolRangeStart)
      expect(event.rangeEnd).toStrictEqual(mock.ipPoolRangeEnd)

      // make sure account was created
      const ipPool = await program.account.ipPool.fetch(mock.ipPoolPda)
      expect(ipPool.rangeStart).toStrictEqual(mock.ipPoolRangeStart)
      expect(ipPool.rangeEnd).toStrictEqual(mock.ipPoolRangeEnd)
    })

    // given previous case created this device
    test('cannot add the same ip pool twice', async () => {
      // small wait to ensure previous tx is processed
      await new Promise((resolve) => setTimeout(resolve, 100))

      try {
        await program.methods
          .addIpPool(mock.ipPoolRangeStart, mock.ipPoolRangeEnd)
          .accounts({
            caller: wallet.publicKey,
            config: mock.configPda,
            ipPool: mock.ipPoolPda,
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
          `Allocate: account Address { address: ${mock.ipPoolPda.toBase58()}, base: None } already in use`,
        )
      }
    })
  })
