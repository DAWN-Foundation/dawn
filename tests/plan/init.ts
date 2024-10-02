import * as anchor from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { PublicKey } from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import { setup } from './utils'

describe('plan::initialize', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.Plan as Program<Plan>
  const wallet = provider.wallet as NodeWallet

  const dawnFee = new BN(200) // 2% fee (dawn_fee)
  const andrenaFee = new BN(500) // 5% fee (andrena_fee)
  const andrenaDawnSplit = new BN(9000) // 90% fee (andrena_dawn_split)
  const boDawnSplit = new BN(8000) // 80% fee (bo_dawn_split)
  const boEscrowSplit = new BN(2000) // 20% fee (bo_escrow_split)

  // Generate config PDA
  const [configPda, configBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )

  let usdcMint: PublicKey
  let dawnMint: PublicKey

  let andrenaUsdcAccount: PublicKey
  let andrenaDawnAccount: PublicKey

  before(async () => {
    const init = await setup(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
    )

    usdcMint = init.usdcMint
    dawnMint = init.dawnMint
    andrenaUsdcAccount = init.andrenaUsdcAccount
    andrenaDawnAccount = init.andrenaDawnAccount
  })

  it('initializes the program', async () => {
    const tx = await program.methods
      .initialize(
        dawnFee,
        andrenaFee,
        andrenaDawnSplit,
        boDawnSplit,
        boEscrowSplit,
      )
      .accounts({
        caller: wallet.payer.publicKey,
        usdcMint,
        dawnMint,
        andrenaUsdcAccount,
        andrenaDawnAccount,
      })
      .rpc()
    assert.ok(tx.length > 0)

    const config = await program.account.config.fetch(configPda)

    // authority
    assert.ok(config.authority.equals(wallet.payer.publicKey))
    assert.ok(config.bump == configBump)
    // fees
    assert.ok(config.dawnFee.eq(dawnFee))
    assert.ok(config.andrenaFee.eq(andrenaFee))
    // splits
    assert.ok(config.andrenaDawnSplit.eq(andrenaDawnSplit))
    assert.ok(config.boDawnSplit.eq(boDawnSplit))
    assert.ok(config.boEscrowSplit.eq(boEscrowSplit))
    // accounts
    assert.ok(config.usdcMint.equals(usdcMint))
    assert.ok(config.dawnMint.equals(dawnMint))
    assert.ok(config.andrenaUsdcAccount.equals(andrenaUsdcAccount))
    assert.ok(config.andrenaDawnAccount.equals(andrenaDawnAccount))
  })
})
