import { expect, test, beforeAll } from '@jest/globals'
import * as anchor from '@coral-xyz/anchor'
import { Program, Wallet } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { PublicKey, SendTransactionError } from '@solana/web3.js'
import { BankrunProvider, startAnchor } from 'anchor-bankrun'

import { Dawn, IDL } from '../../target/types/dawn'
import {
  setup,
  mock,
  getProvider,
  createAccounts,
  PROGRAM_ID,
  confirmTx,
} from '../../app/utils'

export const configTests = () =>
  describe('dawn::configure', () => {
    let program: Program<Dawn>
    let provider: BankrunProvider
    let wallet: NodeWallet

    beforeAll(async () => {
      const accounts = await createAccounts()
      provider = await getProvider(accounts.addedAccounts)
      provider.wallet = new Wallet(accounts.wallet)
      anchor.setProvider(provider)

      program = new Program<Dawn>(IDL, PROGRAM_ID, provider)
      wallet = provider.wallet

      await setup(provider, accounts)
    })

    // Generate config PDA
    const [configPda, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from('config')],
      PROGRAM_ID,
    )

    test('mock setup', () => {
      assert.exists(mock)
    })

    test('configures the program', async () => {
      const tx = await program.methods
        .configure(mock.daoFee, mock.validatorFee, mock.medallionFee)
        .accounts({
          caller: wallet.payer.publicKey,
          config: configPda,
          tokenConfig: mock.tokenConfigPda,
          usdcMint: mock.usdcMint,
          dawnMint: mock.dawnMint,
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
      assert.ok(config.usdcMint.equals(mock.usdcMint))
      assert.ok(config.dawnMint.equals(mock.dawnMint))
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

    test('cannot be reinitialized', async () => {
      // small wait to ensure previous tx is processed
      await new Promise((resolve) => setTimeout(resolve, 100))

      try {
        await program.methods
          .configure(mock.daoFee, mock.validatorFee, mock.medallionFee)
          .accounts({
            caller: wallet.payer.publicKey,
            config: configPda,
            tokenConfig: mock.tokenConfigPda,
            usdcMint: mock.usdcMint,
            dawnMint: mock.dawnMint,
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

        assert.ok(false)
      } catch (error) {
        expect(error instanceof SendTransactionError).toBeTruthy()
        const err: SendTransactionError = error
        const txError = err.logs.find((log) => log.includes('already in use'))
        expect(txError).toBeDefined()
        expect(txError).toBe(
          `Allocate: account Address { address: ${configPda.toBase58()}, base: None } already in use`,
        )
      }
    })
  })
