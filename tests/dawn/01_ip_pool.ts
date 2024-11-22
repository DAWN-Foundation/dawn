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
  IpV4Bytes,
  IpV6Bytes,
} from '../../app/utils'
import { beforeAll, expect } from '@jest/globals'
import { BanksClient } from 'solana-bankrun'
import { BankrunProvider } from 'anchor-bankrun'

/// Maximum length of a device model
const MAX_DEVICE_MODEL_LEN = 32

/// Maximum length of a device manufacturer
const MAX_DEVICE_MANUFACTURER_LEN = 64

interface IpPoolAdded {
  ipPool: PublicKey
  ipV4: IpV4Bytes
  ipV4CidrMask: number
  ipV6: IpV6Bytes
  ipV6CidrMask: number
}

interface IpLeased {
  ipLease: PublicKey
  ipPool: PublicKey
  device: PublicKey
  ipV4: IpV4Bytes
  ipV4CidrMask: number
  ipV6: IpV6Bytes
  ipV6CidrMask: number
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
          .addIpPool(
            mock.poolIpV4,
            mock.poolIpV4CidrMask,
            mock.poolIpV6,
            mock.poolIpV6CidrMask,
          )
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

    test('cannot add ip pool with ip v4 with 0.0.0.0', async () => {
      const poolIpV4 = [0, 0, 0, 0]
      const poolIpV4CidrMask = 24

      const [ipPoolPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('ip_pool'),
          Buffer.from(poolIpV4),
          Buffer.from([poolIpV4CidrMask]),
          Buffer.from(
            mock.poolIpV6.flatMap((byte) => new BN(byte).toArray('le', 2)),
          ),
          Buffer.from([mock.poolIpV6CidrMask]),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addIpPool(
            poolIpV4,
            poolIpV4CidrMask,
            mock.poolIpV6,
            mock.poolIpV6CidrMask,
          )
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
        expect(err.error.errorMessage).toBe('Invalid IP range')
      }
    })

    test('cannot add ip pool with ip v4 with 255.255.255.255', async () => {
      const poolIpV4 = [255, 255, 255, 255]
      const poolIpV4CidrMask = 24

      const [ipPoolPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('ip_pool'),
          Buffer.from(poolIpV4),
          Buffer.from([poolIpV4CidrMask]),
          Buffer.from(
            mock.poolIpV6.flatMap((byte) => new BN(byte).toArray('le', 2)),
          ),
          Buffer.from([mock.poolIpV6CidrMask]),
        ],
        program.programId,
      )

      try {
        await program.methods
          .addIpPool(
            poolIpV4,
            poolIpV4CidrMask,
            mock.poolIpV6,
            mock.poolIpV6CidrMask,
          )
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
        expect(err.error.errorMessage).toBe('Invalid IP range')
      }
    })

    test('adds the ip pool', async () => {
      const tx = await program.methods
        .addIpPool(
          mock.poolIpV4,
          mock.poolIpV4CidrMask,
          mock.poolIpV6,
          mock.poolIpV6CidrMask,
        )
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
      expect(event.ipV4).toStrictEqual(mock.poolIpV4)
      expect(event.ipV4CidrMask).toStrictEqual(mock.poolIpV4CidrMask)
      expect(event.ipV6).toStrictEqual(mock.poolIpV6)
      expect(event.ipV6CidrMask).toStrictEqual(mock.poolIpV6CidrMask)

      // make sure account was created
      const ipPool = await program.account.ipPool.fetch(mock.ipPoolPda)
      expect(ipPool.ipV4).toStrictEqual(mock.poolIpV4)
      expect(ipPool.ipV4CidrMask).toStrictEqual(mock.poolIpV4CidrMask)
      expect(ipPool.ipV6).toStrictEqual(mock.poolIpV6)
      expect(ipPool.ipV6CidrMask).toStrictEqual(mock.poolIpV6CidrMask)
    })

    // given previous case created this device
    test('cannot add the same ip pool twice', async () => {
      // small wait to ensure previous tx is processed
      await new Promise((resolve) => setTimeout(resolve, 200))

      try {
        await program.methods
          .addIpPool(
            mock.poolIpV4,
            mock.poolIpV4CidrMask,
            mock.poolIpV6,
            mock.poolIpV6CidrMask,
          )
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

export const leaseIpTests = () =>
  describe('dawn::lease_ip', () => {
    const wallet = loadWallet()
    let provider: BankrunProvider
    let program: Program<Dawn>

    // beforeAll(async () => {
    //   provider = await getProvider()
    //   provider.wallet = wallet

    //   anchor.setProvider(provider)

    //   program = new Program<Dawn>(IDL, PROGRAM_ID, provider)
    // })

    // test('cannot lease ip by non-authority', async () => {
    //   provider.wallet = new Wallet(mock.serviceProvider)
    //   const program2 = new Program<Dawn>(IDL, PROGRAM_ID, provider)

    //   try {
    //     await program2.methods
    //       .leaseIp(
    //         mock.devicePda,
    //         mock.leaseIpV4,
    //         mock.leaseIpV4CidrMask,
    //         mock.leaseIpV6,
    //         mock.leaseIpV6CidrMask,
    //       )
    //       .accounts({
    //         caller: mock.serviceProvider.publicKey,
    //         config: mock.configPda,
    //         device: mock.devicePda,
    //         ipPool: mock.ipPoolPda,
    //         ipLease: mock.ipLeasePda,
    //       })
    //       .signers([mock.serviceProvider])
    //       .rpc()
    //     expect(false).toBeTruthy()
    //   } catch (error) {
    //     expect(error instanceof AnchorError).toBeTruthy()
    //   } finally {
    //     provider.wallet = loadWallet()
    //   }
    // })

    // test('leases the ip', async () => {
    //   const tx = program.methods
    //     .leaseIp(
    //       mock.devicePda,
    //       mock.leaseIpV4,
    //       mock.leaseIpV4CidrMask,
    //       mock.leaseIpV6,
    //       mock.leaseIpV6CidrMask,
    //     )
    //     .accounts({
    //       caller: wallet.publicKey,
    //       config: mock.configPda,
    //       device: mock.devicePda,
    //       ipPool: mock.ipPoolPda,
    //       ipLease: mock.ipLeasePda,
    //     })
    //     .signers([wallet.payer])
    //     .rpc()
    //     .catch((error) => {
    //       console.log(error)
    //     })

    //   // const txDetails = await confirmTx(provider, tx)

    //   // // make sure event was emitted
    //   // const event = await getEvent<IpLeased>(program, txDetails, 'IpLeased')
    //   // expect(event.ipV4).toStrictEqual(mock.leaseIpV4)
    //   // expect(event.ipV4CidrMask).toStrictEqual(mock.leaseIpV4CidrMask)
    //   // expect(event.ipV6).toStrictEqual(mock.leaseIpV6)
    //   // expect(event.ipV6CidrMask).toStrictEqual(mock.leaseIpV6CidrMask)

    //   // // make sure account was created
    //   // const ipLease = await program.account.ipLease.fetch(mock.ipLeasePda)
    //   // expect(ipLease.ipV4).toStrictEqual(mock.leaseIpV4)
    //   // expect(ipLease.ipV4CidrMask).toStrictEqual(mock.leaseIpV4CidrMask)
    //   // expect(ipLease.ipV6).toStrictEqual(mock.leaseIpV6)
    //   // expect(ipLease.ipV6CidrMask).toStrictEqual(mock.leaseIpV6CidrMask)
    // })
  })
