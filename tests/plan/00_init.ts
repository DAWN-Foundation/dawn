import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { PublicKey, SendTransactionError } from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import { setup, mock } from './utils'

describe('plan::initialize', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.Plan as Program<Plan>
  const wallet = provider.wallet as NodeWallet

  // Generate config PDA
  const [configPda, configBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )

  before(async () => {
    await setup(provider, wallet)
  })

  it('mock setup', () => {
    assert.exists(mock)
  })

  it('initializes the program', async () => {
    const tx = await program.methods
      .initialize(mock.daoFee, mock.validatorFee, mock.medallionFee)
      .accounts({
        caller: wallet.payer.publicKey,
        usdcMint: mock.usdcMint,
        dawnMint: mock.dawnMint,
        daoDawnAccount: mock.daoDawnAccount,
        validatorDawnAccount: mock.validatorDawnAccount,
        medallionDawnAccount: mock.medallionDawnAccount,
        raydium: mock.raydium,
        raydiumConfig: mock.raydiumConfig,
        raydiumPool: mock.raydiumPool,
        raydiumObservation: mock.raydiumObservation,
        memoProgram: mock.memoProgram,
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
    assert.ok(config.raydiumConfig.equals(mock.raydiumConfig))
    assert.ok(config.raydiumPool.equals(mock.raydiumPool))
    assert.ok(config.raydiumObservation.equals(mock.raydiumObservation))
  })

  it('cannot be reinitialized', async () => {
    try {
      await program.methods
        .initialize(mock.daoFee, mock.validatorFee, mock.medallionFee)
        .accounts({
          caller: wallet.payer.publicKey,
          usdcMint: mock.usdcMint,
          dawnMint: mock.dawnMint,
          daoDawnAccount: mock.daoDawnAccount,
          validatorDawnAccount: mock.validatorDawnAccount,
          medallionDawnAccount: mock.medallionDawnAccount,
          raydium: mock.raydium,
          raydiumConfig: mock.raydiumConfig,
          raydiumPool: mock.raydiumPool,
          raydiumObservation: mock.raydiumObservation,
          memoProgram: mock.memoProgram,
        })
        .rpc()
      assert.ok(false)
    } catch (error) {
      assert.ok(error instanceof SendTransactionError)
      const err: SendTransactionError = error
      assert.strictEqual(
        err.transactionError.message,
        'Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0',
      )
    }
  })
})
