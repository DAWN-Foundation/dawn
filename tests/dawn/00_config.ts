import { test, beforeAll } from '@jest/globals'
import * as anchor from '@coral-xyz/anchor'
import { AnchorError, BN, Program, Wallet } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { PublicKey, SendTransactionError, SystemProgram } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'
import { getMint, getAccount } from 'spl-token-bankrun'

import { Dawn } from '../../target/types/dawn'
import {
  setup,
  mock,
  getProvider,
  createAccounts,
  getConfigPda,
  getRootIpBlockPda,
  getIpRegistryPda,
  getEvent,
  confirmTx,
  METADATA_PROGRAM_ID,
} from '../../sdk/utils'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

interface RootIpBlockInitialized {
  rootIpBlock: PublicKey
  tier: number
  baseIpv4: number
  basePrefix: number
  createdAt: number
}

const MAX_U64 = new BN(2).pow(new BN(64)).sub(new BN(1))
// mask where the last 32 chunks are marked as full
const CHUNKS_32_U64 = '18446744069414584320'

export const configTests = () =>
  describe('dawn::config', () => {
    let program: Program<Dawn>
    let provider: BankrunProvider
    let wallet: NodeWallet
    let configPda: PublicKey
    let configBump: number

    beforeAll(async () => {
      const accounts = await createAccounts()
      provider = await getProvider(accounts.addedAccounts)
      provider.wallet = new Wallet(accounts.wallet)
      anchor.setProvider(provider)

      program = anchor.workspace.DAWN as Program<Dawn>
      wallet = provider.wallet

      await setup(provider, accounts)

      // Generate config PDA
      const config = getConfigPda(program)
      configPda = config[0]
      configBump = config[1]
    })

    test('mock setup', () => {
      assert.exists(mock)
    })

    test('cannot reinitialize the token', async () => {
      try {
        await program.methods
          .initToken()
          .accountsPartial({
            caller: wallet.publicKey,
            tokenConfig: mock.tokenConfigPda,
            dawnMint: mock.dawnMint,
            callerDawnAccount: mock.walletDawnAccount,
          })
          .signers([wallet.payer])
          .rpc()
        assert.fail('should not be able to reinitialize the token')
      } catch (error) {
        assert.ok(error instanceof SendTransactionError)
        const err: SendTransactionError = error
        const msg = `Allocate: account Address { address: ${mock.tokenConfigPda.toBase58()}, base: None } already in use`
        const alreadyInitialized = err.logs?.find((log) => log.includes(msg))
        assert.ok(alreadyInitialized)
      }
    })

    test('initializes config (one-time)', async () => {
      const tx = await program.methods
        .initializeConfig(mock.daoFee, mock.validatorFee, mock.medallionFee)
        .accountsStrict({
          caller: wallet.payer.publicKey,
          apiAuthority: wallet.payer.publicKey,
          config: configPda,
          tokenConfig: mock.tokenConfigPda,
          stableMint: mock.stableMint,
          dawnMint: mock.dawnMint,
          feePoolDawnAccount: mock.feePoolDawnAccount,
          daoDawnAccount: mock.daoDawnAccount,
          validatorDawnAccount: mock.validatorDawnAccount,
          medallionDawnAccount: mock.medallionDawnAccount,
          raydium: mock.raydium,
          raydiumAuthority: mock.raydiumAuthority,
          raydiumConfig: mock.raydiumConfig,
          raydiumPool: mock.raydiumPool,
          raydiumObservation: mock.raydiumObservation,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc()

      assert.ok(tx.length > 0)

      const config = await program.account.config.fetch(configPda)

      // authority
      assert.ok(config.authority.equals(wallet.payer.publicKey))
      assert.equal(config.bump, configBump)

      // fees
      assert.ok(config.daoFee.eq(mock.daoFee))
      assert.ok(config.validatorFee.eq(mock.validatorFee))
      assert.ok(config.medallionFee.eq(mock.medallionFee))

      // accounts
      assert.ok(config.stableMint.equals(mock.stableMint))
      assert.ok(config.dawnMint.equals(mock.dawnMint))
      assert.ok(config.feePoolDawnAccount.equals(mock.feePoolDawnAccount))
      assert.ok(config.daoDawnAccount.equals(mock.daoDawnAccount))
      assert.ok(config.validatorDawnAccount.equals(mock.validatorDawnAccount))
      assert.ok(config.medallionDawnAccount.equals(mock.medallionDawnAccount))

      // raydium
      assert.ok(config.raydium.equals(mock.raydium))
      assert.ok(config.raydiumAuthority.equals(mock.raydiumAuthority))
      assert.ok(config.raydiumConfig.equals(mock.raydiumConfig))
      assert.ok(config.raydiumPool.equals(mock.raydiumPool))
      assert.ok(config.raydiumObservation.equals(mock.raydiumObservation))
    })

    test('updates config (authority-gated)', async () => {
      // small wait to ensure previous tx is processed
      await new Promise((resolve) => setTimeout(resolve, 100))

      const newDaoFee = new BN(200)

      const tx = await program.methods
        .updateConfig(
          newDaoFee, // Update dao fee
          null, // Keep validator fee
          null, // Keep medallion fee
          null, // Keep raydium
          null, // Keep raydium authority
          null, // Keep raydium pool
          null, // Keep raydium config
          null, // Keep raydium observation
          null, // Keep api authority
        )
        .accountsStrict({
          caller: wallet.payer.publicKey,
          config: configPda,
          tokenConfig: mock.tokenConfigPda,
          stableMint: mock.stableMint,
          dawnMint: mock.dawnMint,
          feePoolDawnAccount: mock.feePoolDawnAccount,
          daoDawnAccount: mock.daoDawnAccount,
          validatorDawnAccount: mock.validatorDawnAccount,
          medallionDawnAccount: mock.medallionDawnAccount,
          raydium: mock.raydium,
          raydiumAuthority: mock.raydiumAuthority,
          raydiumConfig: mock.raydiumConfig,
          raydiumPool: mock.raydiumPool,
          raydiumObservation: mock.raydiumObservation,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc()

      assert.ok(tx.length > 0)

      let config = await program.account.config.fetch(configPda)

      // authority should remain the same
      assert.ok(config.authority.equals(wallet.payer.publicKey))
      assert.equal(config.bump, configBump)

      // fees - dao fee should be updated, others remain the same
      assert.ok(config.daoFee.eq(newDaoFee))
      assert.ok(config.validatorFee.eq(mock.validatorFee))
      assert.ok(config.medallionFee.eq(mock.medallionFee))

      // Update config back to original dao fee for subsequent tests
      await program.methods
        .updateConfig(
          mock.daoFee, // Restore original dao fee
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
        )
        .accountsPartial({
          caller: wallet.payer.publicKey,
          config: configPda,
          tokenConfig: mock.tokenConfigPda,
          stableMint: mock.stableMint,
          dawnMint: mock.dawnMint,
          feePoolDawnAccount: mock.feePoolDawnAccount,
          daoDawnAccount: mock.daoDawnAccount,
          validatorDawnAccount: mock.validatorDawnAccount,
          medallionDawnAccount: mock.medallionDawnAccount,
          raydium: mock.raydium,
          raydiumAuthority: mock.raydiumAuthority,
          raydiumConfig: mock.raydiumConfig,
          raydiumPool: mock.raydiumPool,
          raydiumObservation: mock.raydiumObservation,
        })
        .rpc()

      config = await program.account.config.fetch(configPda)

      // Verify it's back to the original value
      assert.ok(config.daoFee.eq(mock.daoFee))

      // accounts should remain the same
      assert.ok(config.stableMint.equals(mock.stableMint))
      assert.ok(config.dawnMint.equals(mock.dawnMint))
      assert.ok(config.feePoolDawnAccount.equals(mock.feePoolDawnAccount))
      assert.ok(config.daoDawnAccount.equals(mock.daoDawnAccount))
      assert.ok(config.validatorDawnAccount.equals(mock.validatorDawnAccount))
      assert.ok(config.medallionDawnAccount.equals(mock.medallionDawnAccount))

      // raydium should remain the same
      assert.ok(config.raydium.equals(mock.raydium))
      assert.ok(config.raydiumAuthority.equals(mock.raydiumAuthority))
      assert.ok(config.raydiumConfig.equals(mock.raydiumConfig))
      assert.ok(config.raydiumPool.equals(mock.raydiumPool))
      assert.ok(config.raydiumObservation.equals(mock.raydiumObservation))
    })

    test('non-authority cannot add metadata', async () => {
      // Find the metadata PDA
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          METADATA_PROGRAM_ID.toBuffer(),
          mock.dawnMint.toBuffer(),
        ],
        METADATA_PROGRAM_ID,
      )

      try {
        await program.methods
          .initMetadata()
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            tokenConfig: mock.tokenConfigPda,
            config: configPda,
            dawnMint: mock.dawnMint,
            metadata: metadataPda,
            tokenMetadataProgram: METADATA_PROGRAM_ID,
          })
          .signers([mock.serviceProvider])
          .rpc()
        assert.fail('should not be able to add metadata as non-authority')
      } catch (error) {
        assert.ok(error instanceof AnchorError)
        const err: AnchorError = error
        assert.equal(
          err.error.errorMessage,
          'Unauthorized: caller is not the authority',
        )
      }
    })

    test('should add metadata to the token', async () => {
      // Find the metadata PDA
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          METADATA_PROGRAM_ID.toBuffer(),
          mock.dawnMint.toBuffer(),
        ],
        METADATA_PROGRAM_ID,
      )

      await program.methods
        .initMetadata()
        .accountsPartial({
          caller: wallet.publicKey,
          tokenConfig: mock.tokenConfigPda,
          config: configPda,
          dawnMint: mock.dawnMint,
          metadata: metadataPda,
          tokenMetadataProgram: METADATA_PROGRAM_ID,
        })
        .signers([wallet.payer])
        .rpc()

      // Verify metadata was created
      const metadataAccount = await provider.connection.getAccountInfo(
        metadataPda,
      )
      console.log({ metadataAccount })
      assert.ok(metadataAccount, 'Metadata account should exist')
    })

    test('cannot add metadata twice', async () => {
      // Find the metadata PDA
      const [metadataPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          METADATA_PROGRAM_ID.toBuffer(),
          mock.dawnMint.toBuffer(),
        ],
        METADATA_PROGRAM_ID,
      )

      try {
        await program.methods
          .initMetadata()
          .accountsPartial({
            caller: wallet.publicKey,
            tokenConfig: mock.tokenConfigPda,
            config: configPda,
            dawnMint: mock.dawnMint,
            metadata: metadataPda,
            tokenMetadataProgram: METADATA_PROGRAM_ID,
          })
          .signers([wallet.payer])
          .rpc()
        assert.fail('should not be able to add metadata twice')
      } catch (error) {
        assert.ok(error instanceof SendTransactionError)
      }
    })

    // DISABLED with the instructions they exercise — see DAWN-minimal-deploy-squads
    // (ipam::initialize_root_ip_block is commented out in lib.rs)
    // test('initializes loopback root IP block', async () => {
    //   // small wait to ensure previous tx is processed
    //   await new Promise((resolve) => setTimeout(resolve, 100))
    //
    //   // Get root IP block PDAs for all tiers
    //   const loopbackRootPda = getRootIpBlockPda(1, 0) // Loopback tier
    //
    //   const tx = await program.methods
    //     .initializeRootIpBlock(1, 0x64400000, 11)
    //     .accountsPartial({
    //       caller: wallet.payer.publicKey,
    //       authority: wallet.payer.publicKey,
    //       config: configPda,
    //       rootIpBlock: loopbackRootPda,
    //     })
    //     .signers([wallet.payer])
    //     .transaction()
    //
    //   const txDetails = await confirmTx(provider, tx)
    //
    //   // Verify at least one event was emitted (there should be 3, one for each tier)
    //   const event = await getEvent<RootIpBlockInitialized>(
    //     program,
    //     txDetails,
    //     'rootIpBlockInitialized',
    //   )
    //   assert.ok(event.rootIpBlock)
    //   assert.ok(event.createdAt > 0)
    //
    //   // Verify accounts were created
    //   const loopbackRoot = await program.account.rootIpBlock.fetch(
    //     loopbackRootPda,
    //   )
    //
    //   // Verify Loopback tier (Tier 1)
    //   assert.equal(loopbackRoot.tier.loopback !== undefined, true)
    //   assert.equal(loopbackRoot.baseIpv4, 0x64400000) // 100.64.0.0
    //   assert.equal(loopbackRoot.baseCidr, 11)
    //   assert.equal(loopbackRoot.blockCidr, 22)
    //   assert.ok(loopbackRoot.rootChunks.length === 32) // 2048 blocks / 64 = 32 chunks
    //
    //   // Verify all have empty bitmaps initially (all zeros)
    //   assert.equal(loopbackRoot.rootSummary64.toString(), CHUNKS_32_U64)
    //
    //   // Verify all chunks are initially empty
    //   loopbackRoot.rootChunks.forEach((chunk) =>
    //     assert.equal(chunk.toString(), '0'),
    //   )
    // })

    // DISABLED with the instructions they exercise — see DAWN-minimal-deploy-squads
    // (ipam::initialize_root_ip_block is commented out in lib.rs)
    // test('initializes subscriber root IP block', async () => {
    //   // small wait to ensure previous tx is processed
    //   await new Promise((resolve) => setTimeout(resolve, 100))
    //
    //   // Get root IP block PDAs for all tiers
    //   const subscriberRootPda = getRootIpBlockPda(0, 0) // Subscriber tier
    //   const subscriberIpRegistryPda = getIpRegistryPda(0)
    //
    //   const tx = await program.methods
    //     .initializeRootIpBlock(0, 0x0a400000, 10)
    //     .accountsPartial({
    //       caller: wallet.payer.publicKey,
    //       config: configPda,
    //       authority: wallet.payer.publicKey,
    //       rootIpBlock: subscriberRootPda,
    //       ipRegistry: subscriberIpRegistryPda,
    //     })
    //     .signers([wallet.payer])
    //     .transaction()
    //
    //   const txDetails = await confirmTx(provider, tx)
    //
    //   // Verify at least one event was emitted (there should be 3, one for each tier)
    //   const event = await getEvent<RootIpBlockInitialized>(
    //     program,
    //     txDetails,
    //     'rootIpBlockInitialized',
    //   )
    //   assert.ok(event.rootIpBlock)
    //   assert.ok(event.createdAt > 0)
    //
    //   // Verify accounts were created
    //   const subscriberRoot = await program.account.rootIpBlock.fetch(
    //     subscriberRootPda,
    //   )
    //
    //   // Verify Subscriber tier (Tier 0)
    //   assert.equal(subscriberRoot.tier.subscriber !== undefined, true)
    //   assert.equal(subscriberRoot.baseIpv4, 0x0a400000) // 10.64.0.0
    //   assert.equal(subscriberRoot.baseCidr, 10)
    //   assert.equal(subscriberRoot.blockCidr, 22)
    //   assert.ok(subscriberRoot.rootChunks.length === 64) // 4096 blocks / 64 = 64 chunks
    //
    //   // Verify all have empty bitmaps initially (all zeros)
    //   assert.equal(subscriberRoot.rootSummary64.toString(), '0')
    //
    //   // Verify all chunks are initially empty
    //   subscriberRoot.rootChunks.forEach((chunk) =>
    //     assert.equal(chunk.toString(), '0'),
    //   )
    // })

    // DISABLED with the instructions they exercise — see DAWN-minimal-deploy-squads
    // (ipam::initialize_root_ip_block is commented out in lib.rs)
    // test('initializes ptp root IP block', async () => {
    //   // small wait to ensure previous tx is processed
    //   await new Promise((resolve) => setTimeout(resolve, 100))
    //
    //   // Get root IP block PDAs for all tiers
    //   const ptpRootPda = getRootIpBlockPda(2, 0) // PtP tier
    //
    //   const tx = await program.methods
    //     .initializeRootIpBlock(2, 0x64600000, 11)
    //     .accountsPartial({
    //       caller: wallet.payer.publicKey,
    //       config: configPda,
    //       authority: wallet.payer.publicKey,
    //       rootIpBlock: ptpRootPda,
    //     })
    //     .signers([wallet.payer])
    //     .transaction()
    //
    //   const txDetails = await confirmTx(provider, tx)
    //
    //   // Verify at least one event was emitted (there should be 3, one for each tier)
    //   const event = await getEvent<RootIpBlockInitialized>(
    //     program,
    //     txDetails,
    //     'rootIpBlockInitialized',
    //   )
    //   assert.ok(event.rootIpBlock)
    //   assert.ok(event.createdAt > 0)
    //
    //   // Verify accounts were created
    //   const ptpRoot = await program.account.rootIpBlock.fetch(ptpRootPda)
    //
    //   // Verify PtP tier (Tier 2)
    //   assert.equal(ptpRoot.tier.ptP !== undefined, true)
    //   assert.equal(ptpRoot.baseIpv4, 0x64600000) // 100.96.0.0
    //   assert.equal(ptpRoot.baseCidr, 11)
    //   assert.equal(ptpRoot.blockCidr, 22)
    //   assert.ok(ptpRoot.rootChunks.length === 32) // 2048 blocks / 64 = 32 chunks
    //
    //   // Verify all have empty bitmaps initially (all zeros)
    //   assert.equal(ptpRoot.rootSummary64.toString(), CHUNKS_32_U64)
    //
    //   // Verify all chunks are initially empty
    //   ptpRoot.rootChunks.forEach((chunk) => assert.equal(chunk.toString(), '0'))
    // })
  })
