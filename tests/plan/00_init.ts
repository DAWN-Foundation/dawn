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
    await setup(provider.connection, wallet)
  })

  it('mock setup', () => {
    assert.exists(mock)
  })

  it('initializes the program', async () => {
    const tx = await program.methods
      .initialize(
        mock.dawnFee,
        mock.andrenaFee,
        mock.andrenaDawnRatio,
        mock.boDawnRatio,
        mock.boEscrowRatio,
      )
      .accounts({
        caller: wallet.payer.publicKey,
        usdcMint: mock.usdcMint,
        dawnMint: mock.dawnMint,
        andrenaUsdcAccount: mock.andrenaUsdcAccount,
        andrenaDawnAccount: mock.andrenaDawnAccount,
        dawnUsdcAccount: mock.dawnUsdcAccount,
      })
      .rpc()

    assert.ok(tx.length > 0)

    const config = await program.account.config.fetch(configPda)

    // console.log(config)

    // authority
    assert.ok(config.authority.equals(wallet.payer.publicKey))
    assert.equal(config.bump, configBump)
    // fees
    assert.ok(config.dawnFee.eq(mock.dawnFee))
    assert.ok(config.andrenaFee.eq(mock.andrenaFee))
    // ratio
    assert.ok(config.andrenaDawnRatio.eq(mock.andrenaDawnRatio))
    assert.ok(config.boDawnRatio.eq(mock.boDawnRatio))
    assert.ok(config.boEscrowRatio.eq(mock.boEscrowRatio))
    // accounts
    assert.ok(config.usdcMint.equals(mock.usdcMint))
    assert.ok(config.dawnMint.equals(mock.dawnMint))
    assert.ok(config.andrenaUsdcAccount.equals(mock.andrenaUsdcAccount))
    assert.ok(config.andrenaDawnAccount.equals(mock.andrenaDawnAccount))
    assert.ok(config.dawnUsdcAccount.equals(mock.dawnUsdcAccount))
  })

  it('cannot be reinitialized', async () => {
    try {
      await program.methods
        .initialize(
          mock.dawnFee,
          mock.andrenaFee,
          mock.andrenaDawnRatio,
          mock.boDawnRatio,
          mock.boEscrowRatio,
        )
        .accounts({
          caller: wallet.payer.publicKey,
          usdcMint: mock.usdcMint,
          dawnMint: mock.dawnMint,
          andrenaUsdcAccount: mock.andrenaUsdcAccount,
          andrenaDawnAccount: mock.andrenaDawnAccount,
          dawnUsdcAccount: mock.dawnUsdcAccount,
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
