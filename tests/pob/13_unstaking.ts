import * as anchor from '@coral-xyz/anchor'
import { Wallet } from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import { Pob } from '../../target/types/pob'
import { expect } from 'chai'
import { beforeAll, describe, it } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js'
import {
  TOKEN_PROGRAM_ID,
  AccountLayout,
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

export const unstakingTests = () =>
  describe('Proof of Bandwidth - Unstaking', () => {
    let wallet: Wallet
    let program: Program<Pob>
    let provider: BankrunProvider

    // Test accounts (separate from shared mock to avoid state pollution)
    let unstakeProver: Keypair
    let unstakeChallenger: Keypair
    let stakeMint: Keypair
    let unstakeProverAta: PublicKey
    let unstakeChallengerAta: PublicKey

    // PDAs
    let unstakeProverPda: PublicKey
    let unstakeChallengerPda: PublicKey
    let unstakeProverVaultPda: PublicKey
    let unstakeChallengerVaultPda: PublicKey

    beforeAll(async () => {
      // Use shared provider
      provider = await getPobProvider()
      wallet = pobMock.wallet!
      program = pobMock.program!
      stakeMint = pobMock.stakeMint!

      // Create separate prover and challenger for unstaking tests
      unstakeProver = Keypair.generate()
      unstakeChallenger = Keypair.generate()

      // Derive PDAs
      ;[unstakeProverPda] = getProverPda(program, unstakeProver.publicKey)
      ;[unstakeChallengerPda] = getChallengerPda(
        program,
        unstakeChallenger.publicKey,
      )
      ;[unstakeProverVaultPda] = getProverVaultPda(program, unstakeProverPda)
      ;[unstakeChallengerVaultPda] = getChallengerVaultPda(
        program,
        unstakeChallengerPda,
      )

      // Create ATAs for the new prover/challenger
      unstakeProverAta = getAssociatedTokenAddressSync(
        stakeMint.publicKey,
        unstakeProver.publicKey,
      )
      unstakeChallengerAta = getAssociatedTokenAddressSync(
        stakeMint.publicKey,
        unstakeChallenger.publicKey,
      )

      // Fund SOL to prover and challenger via transfer
      const fundProverTx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: unstakeProver.publicKey,
          lamports: 10 * 1e9,
        }),
      )
      await provider.sendAndConfirm(fundProverTx, [wallet.payer])

      const fundChallengerTx = new anchor.web3.Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: unstakeChallenger.publicKey,
          lamports: 10 * 1e9,
        }),
      )
      await provider.sendAndConfirm(fundChallengerTx, [wallet.payer])

      // Create ATAs and mint tokens
      const createProverAtaIx = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        unstakeProverAta,
        unstakeProver.publicKey,
        stakeMint.publicKey,
      )

      const createChallengerAtaIx = createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        unstakeChallengerAta,
        unstakeChallenger.publicKey,
        stakeMint.publicKey,
      )

      const mintToProverIx = createMintToInstruction(
        stakeMint.publicKey,
        unstakeProverAta,
        wallet.publicKey,
        100_000_000_000n,
      )

      const mintToChallengerIx = createMintToInstruction(
        stakeMint.publicKey,
        unstakeChallengerAta,
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
    })

    describe('Request Unstake', () => {
      it('Prover requests unstake', async () => {
        // First register the prover
        const [configPda] = getPobConfigPda(program)

        await program.methods
          .registerProver()
          .accountsPartial({
            authority: unstakeProver.publicKey,
            config: configPda,
            stakeMint: stakeMint.publicKey,
            prover: unstakeProverPda,
            userTokenAccount: unstakeProverAta,
            proverVault: unstakeProverVaultPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([unstakeProver])
          .rpc()

        // Verify initial state
        let proverAccount = await program.account.prover.fetch(unstakeProverPda)
        expect(proverAccount.unstakeRequestedSlot.toNumber()).to.equal(0)

        // Request unstake
        const tx = await program.methods
          .requestUnstakeProver()
          .accountsPartial({
            authority: unstakeProver.publicKey,
            config: configPda,
            prover: unstakeProverPda,
            proverVault: unstakeProverVaultPda,
          })
          .signers([unstakeProver])
          .rpc()

        expect(tx).to.be.a('string')

        // Verify unstake was requested
        proverAccount = await program.account.prover.fetch(unstakeProverPda)
        expect(proverAccount.unstakeRequestedSlot.toNumber()).to.be.greaterThan(
          0,
        )
      })

      it('Challenger requests unstake', async () => {
        // First register the challenger
        const [configPda] = getPobConfigPda(program)

        await program.methods
          .registerChallenger()
          .accountsPartial({
            authority: unstakeChallenger.publicKey,
            config: configPda,
            stakeMint: stakeMint.publicKey,
            challenger: unstakeChallengerPda,
            userTokenAccount: unstakeChallengerAta,
            challengerVault: unstakeChallengerVaultPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([unstakeChallenger])
          .rpc()

        // Verify initial state
        let challengerAccount = await program.account.challenger.fetch(
          unstakeChallengerPda,
        )
        expect(challengerAccount.unstakeRequestedSlot.toNumber()).to.equal(0)

        // Request unstake
        const tx = await program.methods
          .requestUnstakeChallenger()
          .accountsPartial({
            authority: unstakeChallenger.publicKey,
            config: configPda,
            challenger: unstakeChallengerPda,
            challengerVault: unstakeChallengerVaultPda,
          })
          .signers([unstakeChallenger])
          .rpc()

        expect(tx).to.be.a('string')

        // Verify unstake was requested
        challengerAccount = await program.account.challenger.fetch(
          unstakeChallengerPda,
        )
        expect(
          challengerAccount.unstakeRequestedSlot.toNumber(),
        ).to.be.greaterThan(0)
      })
    })

    describe('Complete Unstake', () => {
      it('Prover completes unstake after cooldown', async () => {
        const [configPda] = getPobConfigPda(program)

        // Get config to check cooldown period
        const configAccount = await program.account.config.fetch(configPda)
        const cooldownSlots = configAccount.unstakeCooldownSlots.toNumber()

        // Get current unstake request slot
        const proverAccount = await program.account.prover.fetch(
          unstakeProverPda,
        )
        const requestSlot = proverAccount.unstakeRequestedSlot.toNumber()
        const stakeAmount = proverAccount.stakeAmount.toNumber()

        // Warp past cooldown period
        await warpToSlot(provider, requestSlot + cooldownSlots + 1)

        // Get balance before unstake
        const beforeAccountInfo = await provider.connection.getAccountInfo(
          unstakeProverAta,
        )
        const beforeData = AccountLayout.decode(beforeAccountInfo!.data)
        const balanceBefore = Number(beforeData.amount)

        // Complete unstake
        const tx = await program.methods
          .completeUnstakeProver()
          .accountsPartial({
            authority: unstakeProver.publicKey,
            config: configPda,
            stakeMint: stakeMint.publicKey,
            prover: unstakeProverPda,
            userTokenAccount: unstakeProverAta,
            proverVault: unstakeProverVaultPda,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([unstakeProver])
          .rpc()

        expect(tx).to.be.a('string')

        // Verify prover account is closed
        try {
          await program.account.prover.fetch(unstakeProverPda)
          expect.fail('Prover account should be closed')
        } catch (error: any) {
          expect(String(error)).to.match(/Account does not exist|Could not find/)
        }

        // Verify vault is closed (account should not exist)
        try {
          await provider.connection.getAccountInfo(unstakeProverVaultPda)
          expect.fail('Vault should be closed')
        } catch (error: any) {
          // Account doesn't exist, which is expected
          expect(String(error)).to.match(/Could not find/)
        }

        // Verify tokens were returned
        const afterAccountInfo = await provider.connection.getAccountInfo(
          unstakeProverAta,
        )
        const afterData = AccountLayout.decode(afterAccountInfo!.data)
        const balanceAfter = Number(afterData.amount)

        expect(balanceAfter - balanceBefore).to.equal(stakeAmount)
      })

      it('Challenger completes unstake after cooldown', async () => {
        const [configPda] = getPobConfigPda(program)

        // Get config to check cooldown period
        const configAccount = await program.account.config.fetch(configPda)
        const cooldownSlots = configAccount.unstakeCooldownSlots.toNumber()

        // Get current unstake request slot
        const challengerAccount = await program.account.challenger.fetch(
          unstakeChallengerPda,
        )
        const requestSlot = challengerAccount.unstakeRequestedSlot.toNumber()
        const stakeAmount = challengerAccount.stakeAmount.toNumber()

        // Get current slot and warp forward from there
        const currentSlot = await getCurrentSlot(provider)
        const targetSlot = Math.max(
          currentSlot + 1,
          requestSlot + cooldownSlots + 1,
        )
        await warpToSlot(provider, targetSlot)

        // Get balance before unstake
        const beforeAccountInfo = await provider.connection.getAccountInfo(
          unstakeChallengerAta,
        )
        const beforeData = AccountLayout.decode(beforeAccountInfo!.data)
        const balanceBefore = Number(beforeData.amount)

        // Complete unstake
        const tx = await program.methods
          .completeUnstakeChallenger()
          .accountsPartial({
            authority: unstakeChallenger.publicKey,
            config: configPda,
            stakeMint: stakeMint.publicKey,
            challenger: unstakeChallengerPda,
            userTokenAccount: unstakeChallengerAta,
            challengerVault: unstakeChallengerVaultPda,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([unstakeChallenger])
          .rpc()

        expect(tx).to.be.a('string')

        // Verify challenger account is closed
        try {
          await program.account.challenger.fetch(unstakeChallengerPda)
          expect.fail('Challenger account should be closed')
        } catch (error: any) {
          expect(String(error)).to.match(/Account does not exist|Could not find/)
        }

        // Verify vault is closed (account should not exist)
        try {
          await provider.connection.getAccountInfo(unstakeChallengerVaultPda)
          expect.fail('Vault should be closed')
        } catch (error: any) {
          // Account doesn't exist, which is expected
          expect(String(error)).to.match(/Could not find/)
        }

        // Verify tokens were returned
        const afterAccountInfo = await provider.connection.getAccountInfo(
          unstakeChallengerAta,
        )
        const afterData = AccountLayout.decode(afterAccountInfo!.data)
        const balanceAfter = Number(afterData.amount)

        expect(balanceAfter - balanceBefore).to.equal(stakeAmount)
      })
    })
  })
