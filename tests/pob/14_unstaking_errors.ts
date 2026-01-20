import * as anchor from '@coral-xyz/anchor'
import { Wallet } from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Pob } from '../../target/types/pob'
import { expect } from 'chai'
import { beforeAll, describe, it } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import {
  getPobConfigPda,
  getProverPda,
  getChallengerPda,
  getProverVaultPda,
  getChallengerVaultPda,
} from '../../sdk/pda/pob'
import { warpToSlot, getCurrentSlot } from '../../sdk/utils/pob'
import { getPobProvider, pobMock } from './pob-setup'

export const unstakingErrorTests = () =>
  describe('Proof of Bandwidth - Unstaking Errors', () => {
    let wallet: Wallet
    let program: Program<Pob>
    let provider: BankrunProvider

    // Test accounts
    let errorProver: Keypair
    let errorChallenger: Keypair
    let wrongAuthority: Keypair
    let stakeMint: Keypair
    let errorProverAta: PublicKey
    let errorChallengerAta: PublicKey

    // PDAs
    let errorProverPda: PublicKey
    let errorChallengerPda: PublicKey
    let errorProverVaultPda: PublicKey
    let errorChallengerVaultPda: PublicKey

    beforeAll(async () => {
      // Use shared provider
      provider = await getPobProvider()
      wallet = pobMock.wallet!
      program = pobMock.program!
      stakeMint = pobMock.stakeMint!

      // Create test accounts
      errorProver = Keypair.generate()
      errorChallenger = Keypair.generate()
      wrongAuthority = Keypair.generate()

      // Derive PDAs
      ;[errorProverPda] = getProverPda(program, errorProver.publicKey)
      ;[errorChallengerPda] = getChallengerPda(
        program,
        errorChallenger.publicKey,
      )
      ;[errorProverVaultPda] = getProverVaultPda(program, errorProverPda)
      ;[errorChallengerVaultPda] = getChallengerVaultPda(
        program,
        errorChallengerPda,
      )

      // Create ATAs
      errorProverAta = getAssociatedTokenAddressSync(
        stakeMint.publicKey,
        errorProver.publicKey,
      )
      errorChallengerAta = getAssociatedTokenAddressSync(
        stakeMint.publicKey,
        errorChallenger.publicKey,
      )

      // Fund SOL via transfer from wallet
      const fundTx = new anchor.web3.Transaction()
      fundTx.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: errorProver.publicKey,
          lamports: 10 * 1e9,
        }),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: errorChallenger.publicKey,
          lamports: 10 * 1e9,
        }),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: wrongAuthority.publicKey,
          lamports: 10 * 1e9,
        }),
      )
      await provider.sendAndConfirm(fundTx, [wallet.payer])

      // Create ATAs and mint tokens
      const createProverAtaIx = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        errorProverAta,
        errorProver.publicKey,
        stakeMint.publicKey,
      )

      const createChallengerAtaIx = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        errorChallengerAta,
        errorChallenger.publicKey,
        stakeMint.publicKey,
      )

      const mintToProverIx = createMintToInstruction(
        stakeMint.publicKey,
        errorProverAta,
        wallet.publicKey,
        100_000_000_000n,
      )

      const mintToChallengerIx = createMintToInstruction(
        stakeMint.publicKey,
        errorChallengerAta,
        wallet.publicKey,
        100_000_000_000n,
      )

      const setupTx = new anchor.web3.Transaction()
      setupTx.add(
        createProverAtaIx,
        createChallengerAtaIx,
        mintToProverIx,
        mintToChallengerIx,
      )

      await provider.sendAndConfirm(setupTx, [wallet.payer])

      // Register prover and challenger for testing
      const [configPda] = getPobConfigPda(program)

      await program.methods
        .registerProver()
        .accountsPartial({
          authority: errorProver.publicKey,
          config: configPda,
          stakeMint: stakeMint.publicKey,
          prover: errorProverPda,
          userTokenAccount: errorProverAta,
          proverVault: errorProverVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([errorProver])
        .rpc()

      await program.methods
        .registerChallenger()
        .accountsPartial({
          authority: errorChallenger.publicKey,
          config: configPda,
          stakeMint: stakeMint.publicKey,
          challenger: errorChallengerPda,
          userTokenAccount: errorChallengerAta,
          challengerVault: errorChallengerVaultPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([errorChallenger])
        .rpc()
    })

    describe('Request Unstake Errors', () => {
      it('Rejects unauthorized prover unstake request', async () => {
        const [configPda] = getPobConfigPda(program)

        try {
          await program.methods
            .requestUnstakeProver()
            .accountsPartial({
              authority: wrongAuthority.publicKey, // Wrong authority
              config: configPda,
              prover: errorProverPda,
              proverVault: errorProverVaultPda,
            })
            .signers([wrongAuthority])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/Unauthorized|0x1783|constraint/)
        }
      })

      it('Rejects unauthorized challenger unstake request', async () => {
        const [configPda] = getPobConfigPda(program)

        try {
          await program.methods
            .requestUnstakeChallenger()
            .accountsPartial({
              authority: wrongAuthority.publicKey, // Wrong authority
              config: configPda,
              challenger: errorChallengerPda,
              challengerVault: errorChallengerVaultPda,
            })
            .signers([wrongAuthority])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/Unauthorized|0x1783|constraint/)
        }
      })

      it('Rejects double prover unstake request', async () => {
        const [configPda] = getPobConfigPda(program)

        // First request should succeed
        const tx1 = await program.methods
          .requestUnstakeProver()
          .accountsPartial({
            authority: errorProver.publicKey,
            config: configPda,
            prover: errorProverPda,
            proverVault: errorProverVaultPda,
          })
          .signers([errorProver])
          .rpc()

        expect(tx1).to.be.a('string')

        // Verify unstake was requested
        const proverAccount = await program.account.prover.fetch(errorProverPda)
        expect(proverAccount.unstakeRequestedSlot.toNumber()).to.be.greaterThan(
          0,
        )

        // Second request should fail with UnstakeAlreadyRequested
        try {
          await program.methods
            .requestUnstakeProver()
            .accountsPartial({
              authority: errorProver.publicKey,
              config: configPda,
              prover: errorProverPda,
              proverVault: errorProverVaultPda,
            })
            .signers([errorProver])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          // Should match UnstakeAlreadyRequested or show transaction already processed
          expect(String(error)).to.match(
            /UnstakeAlreadyRequested|0x1790|already been processed/,
          )
        }
      })

      it('Rejects double challenger unstake request', async () => {
        const [configPda] = getPobConfigPda(program)

        // First request should succeed
        const tx1 = await program.methods
          .requestUnstakeChallenger()
          .accountsPartial({
            authority: errorChallenger.publicKey,
            config: configPda,
            challenger: errorChallengerPda,
            challengerVault: errorChallengerVaultPda,
          })
          .signers([errorChallenger])
          .rpc()

        expect(tx1).to.be.a('string')

        // Verify unstake was requested
        const challengerAccount = await program.account.challenger.fetch(
          errorChallengerPda,
        )
        expect(
          challengerAccount.unstakeRequestedSlot.toNumber(),
        ).to.be.greaterThan(0)

        // Second request should fail with UnstakeAlreadyRequested
        try {
          await program.methods
            .requestUnstakeChallenger()
            .accountsPartial({
              authority: errorChallenger.publicKey,
              config: configPda,
              challenger: errorChallengerPda,
              challengerVault: errorChallengerVaultPda,
            })
            .signers([errorChallenger])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          // Should match UnstakeAlreadyRequested or show transaction already processed
          expect(String(error)).to.match(
            /UnstakeAlreadyRequested|0x1790|already been processed/,
          )
        }
      })
    })

    describe('Complete Unstake Errors', () => {
      it('Rejects prover complete unstake before cooldown', async () => {
        const [configPda] = getPobConfigPda(program)

        // Try to complete immediately (without waiting for cooldown)
        try {
          await program.methods
            .completeUnstakeProver()
            .accountsPartial({
              authority: errorProver.publicKey,
              config: configPda,
              stakeMint: stakeMint.publicKey,
              prover: errorProverPda,
              userTokenAccount: errorProverAta,
              proverVault: errorProverVaultPda,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([errorProver])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/CooldownNotElapsed|0x178f/)
        }
      })

      it('Rejects challenger complete unstake before cooldown', async () => {
        const [configPda] = getPobConfigPda(program)

        // Try to complete immediately (without waiting for cooldown)
        try {
          await program.methods
            .completeUnstakeChallenger()
            .accountsPartial({
              authority: errorChallenger.publicKey,
              config: configPda,
              stakeMint: stakeMint.publicKey,
              challenger: errorChallengerPda,
              userTokenAccount: errorChallengerAta,
              challengerVault: errorChallengerVaultPda,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([errorChallenger])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/CooldownNotElapsed|0x178f/)
        }
      })

      it('Rejects prover complete unstake when not requested', async () => {
        // Create a new prover who hasn't requested unstake
        const newProver = Keypair.generate()
        const [newProverPda] = getProverPda(program, newProver.publicKey)
        const [newProverVaultPda] = getProverVaultPda(program, newProverPda)
        const newProverAta = getAssociatedTokenAddressSync(
          stakeMint.publicKey,
          newProver.publicKey,
        )

        // Fund and register
        const fundNewProverTx = new anchor.web3.Transaction().add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: newProver.publicKey,
            lamports: 10 * 1e9,
          }),
        )
        await provider.sendAndConfirm(fundNewProverTx, [wallet.payer])

        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          newProverAta,
          newProver.publicKey,
          stakeMint.publicKey,
        )

        const mintIx = createMintToInstruction(
          stakeMint.publicKey,
          newProverAta,
          wallet.publicKey,
          100_000_000_000n,
        )

        const setupTx = new anchor.web3.Transaction()
        setupTx.add(createAtaIx, mintIx)
        await provider.sendAndConfirm(setupTx, [wallet.payer])

        const [configPda] = getPobConfigPda(program)

        await program.methods
          .registerProver()
          .accountsPartial({
            authority: newProver.publicKey,
            config: configPda,
            stakeMint: stakeMint.publicKey,
            prover: newProverPda,
            userTokenAccount: newProverAta,
            proverVault: newProverVaultPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([newProver])
          .rpc()

        // Try to complete unstake without requesting
        try {
          await program.methods
            .completeUnstakeProver()
            .accountsPartial({
              authority: newProver.publicKey,
              config: configPda,
              stakeMint: stakeMint.publicKey,
              prover: newProverPda,
              userTokenAccount: newProverAta,
              proverVault: newProverVaultPda,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([newProver])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/UnstakeNotRequested|0x178e/)
        }
      })

      it('Rejects unauthorized prover complete unstake', async () => {
        const [configPda] = getPobConfigPda(program)

        // Get config and warp past cooldown
        const configAccount = await program.account.config.fetch(configPda)
        const cooldownSlots = configAccount.unstakeCooldownSlots.toNumber()
        const proverAccount = await program.account.prover.fetch(errorProverPda)
        const requestSlot = proverAccount.unstakeRequestedSlot.toNumber()

        await warpToSlot(provider, requestSlot + cooldownSlots + 1)

        // Try to complete with wrong authority
        try {
          await program.methods
            .completeUnstakeProver()
            .accountsPartial({
              authority: wrongAuthority.publicKey, // Wrong authority
              config: configPda,
              stakeMint: stakeMint.publicKey,
              prover: errorProverPda,
              userTokenAccount: errorProverAta,
              proverVault: errorProverVaultPda,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([wrongAuthority])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/Unauthorized|0x1783|constraint/)
        }
      })
    })
  })
