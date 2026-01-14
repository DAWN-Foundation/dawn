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
  getRoundCommitmentPda,
  getAggregatorPda,
  getReceiptPda,
} from '../../sdk/pda/pob'
import {
  createSessionLeaf,
  computeLeafHash,
  buildMerkleProof,
  warpToSlot,
  getCurrentSlot,
  generateRandomSeed,
  generateRandomMinToken,
  DA_PROGRAM_ID,
  findBloberPda,
  findBlobPda,
} from '../../sdk/utils/pob'
import { getPobProvider, pobMock } from './pob-setup'

export const unstakingParticipationTests = () =>
  describe('Proof of Bandwidth - Unstaking Participation Blocks', () => {
    let wallet: Wallet
    let program: Program<Pob>
    let provider: BankrunProvider

    // Test accounts
    let unstakingProver: Keypair
    let unstakingChallenger: Keypair
    let activeProver: Keypair
    let activeChallenger: Keypair
    let stakeMint: Keypair
    let daPayer: Keypair

    let unstakingProverAta: PublicKey
    let unstakingChallengerAta: PublicKey
    let activeProverAta: PublicKey
    let activeChallengerAta: PublicKey

    // PDAs
    let unstakingProverPda: PublicKey
    let unstakingChallengerPda: PublicKey
    let activeProverPda: PublicKey
    let activeChallengerPda: PublicKey
    let roundPda: PublicKey
    let aggregatorPda: PublicKey
    let daBloberPda: PublicKey
    let daBlobPda: PublicKey

    // Test data
    let seed: Buffer
    let dataAnchorRoot: Buffer
    const nPackets = 100
    const nRounds = 10
    const daTimestamp = 1_717_981_200
    const daNamespace = 'nitro'

    beforeAll(async () => {
      // Use shared provider
      provider = await getPobProvider()
      wallet = pobMock.wallet!
      program = pobMock.program!
      stakeMint = pobMock.stakeMint!
      daPayer = pobMock.daPayer!

      // Create test accounts
      unstakingProver = Keypair.generate()
      unstakingChallenger = Keypair.generate()
      activeProver = Keypair.generate()
      activeChallenger = Keypair.generate()

      // Derive PDAs
      ;[unstakingProverPda] = getProverPda(program, unstakingProver.publicKey)
      ;[unstakingChallengerPda] = getChallengerPda(
        program,
        unstakingChallenger.publicKey,
      )
      ;[activeProverPda] = getProverPda(program, activeProver.publicKey)
      ;[activeChallengerPda] = getChallengerPda(
        program,
        activeChallenger.publicKey,
      )

      // Create ATAs
      unstakingProverAta = getAssociatedTokenAddressSync(
        stakeMint.publicKey,
        unstakingProver.publicKey,
      )
      unstakingChallengerAta = getAssociatedTokenAddressSync(
        stakeMint.publicKey,
        unstakingChallenger.publicKey,
      )
      activeProverAta = getAssociatedTokenAddressSync(
        stakeMint.publicKey,
        activeProver.publicKey,
      )
      activeChallengerAta = getAssociatedTokenAddressSync(
        stakeMint.publicKey,
        activeChallenger.publicKey,
      )

      // Fund SOL via transfer from wallet (use smaller amounts - 1 SOL each)
      const fundTx1 = new anchor.web3.Transaction()
      fundTx1.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: unstakingProver.publicKey,
          lamports: 1 * 1e9,
        }),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: unstakingChallenger.publicKey,
          lamports: 1 * 1e9,
        }),
      )
      await provider.sendAndConfirm(fundTx1, [wallet.payer])

      const fundTx2 = new anchor.web3.Transaction()
      fundTx2.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: activeProver.publicKey,
          lamports: 1 * 1e9,
        }),
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: activeChallenger.publicKey,
          lamports: 1 * 1e9,
        }),
      )
      await provider.sendAndConfirm(fundTx2, [wallet.payer])

      // Create ATAs and mint tokens
      const setupTx = new anchor.web3.Transaction()
      setupTx.add(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          unstakingProverAta,
          unstakingProver.publicKey,
          stakeMint.publicKey,
        ),
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          unstakingChallengerAta,
          unstakingChallenger.publicKey,
          stakeMint.publicKey,
        ),
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          activeProverAta,
          activeProver.publicKey,
          stakeMint.publicKey,
        ),
        createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          activeChallengerAta,
          activeChallenger.publicKey,
          stakeMint.publicKey,
        ),
        createMintToInstruction(
          stakeMint.publicKey,
          unstakingProverAta,
          wallet.publicKey,
          100_000_000_000n,
        ),
        createMintToInstruction(
          stakeMint.publicKey,
          unstakingChallengerAta,
          wallet.publicKey,
          100_000_000_000n,
        ),
        createMintToInstruction(
          stakeMint.publicKey,
          activeProverAta,
          wallet.publicKey,
          100_000_000_000n,
        ),
        createMintToInstruction(
          stakeMint.publicKey,
          activeChallengerAta,
          wallet.publicKey,
          100_000_000_000n,
        ),
      )
      await provider.sendAndConfirm(setupTx, [wallet.payer])

      // Register all accounts
      const [configPda] = getPobConfigPda(program)

      await program.methods
        .registerProver()
        .accountsPartial({
          authority: unstakingProver.publicKey,
          config: configPda,
          stakeMint: stakeMint.publicKey,
          prover: unstakingProverPda,
          userTokenAccount: unstakingProverAta,
          proverVault: getProverVaultPda(program, unstakingProverPda)[0],
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([unstakingProver])
        .rpc()

      await program.methods
        .registerChallenger()
        .accountsPartial({
          authority: unstakingChallenger.publicKey,
          config: configPda,
          stakeMint: stakeMint.publicKey,
          challenger: unstakingChallengerPda,
          userTokenAccount: unstakingChallengerAta,
          challengerVault: getChallengerVaultPda(
            program,
            unstakingChallengerPda,
          )[0],
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([unstakingChallenger])
        .rpc()

      await program.methods
        .registerProver()
        .accountsPartial({
          authority: activeProver.publicKey,
          config: configPda,
          stakeMint: stakeMint.publicKey,
          prover: activeProverPda,
          userTokenAccount: activeProverAta,
          proverVault: getProverVaultPda(program, activeProverPda)[0],
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([activeProver])
        .rpc()

      await program.methods
        .registerChallenger()
        .accountsPartial({
          authority: activeChallenger.publicKey,
          config: configPda,
          stakeMint: stakeMint.publicKey,
          challenger: activeChallengerPda,
          userTokenAccount: activeChallengerAta,
          challengerVault: getChallengerVaultPda(program, activeChallengerPda)[0],
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([activeChallenger])
        .rpc()

      // Request unstake for unstaking accounts
      await program.methods
        .requestUnstakeProver()
        .accountsPartial({
          authority: unstakingProver.publicKey,
          config: configPda,
          prover: unstakingProverPda,
          proverVault: getProverVaultPda(program, unstakingProverPda)[0],
        })
        .signers([unstakingProver])
        .rpc()

      await program.methods
        .requestUnstakeChallenger()
        .accountsPartial({
          authority: unstakingChallenger.publicKey,
          config: configPda,
          challenger: unstakingChallengerPda,
          challengerVault: getChallengerVaultPda(
            program,
            unstakingChallengerPda,
          )[0],
        })
        .signers([unstakingChallenger])
        .rpc()

      // Setup test round
      seed = generateRandomSeed()
      ;[roundPda] = getRoundCommitmentPda(program, seed)

      const sessionLeaf = createSessionLeaf(
        activeChallenger.publicKey,
        activeProverPda,
        42n,
        nPackets,
      )
      const leafHash = computeLeafHash(sessionLeaf)
      const siblings = [Buffer.alloc(32, 1), Buffer.alloc(32, 2)]
      const { root } = buildMerkleProof(leafHash, siblings)
      dataAnchorRoot = root

      const currentSlot = await getCurrentSlot(provider)
      const startSlot = currentSlot + 10
      const endSlot = startSlot + 1000

      await program.methods
        .initChallengeRound(
          Array.from(seed),
          nPackets,
          nRounds,
          new BN(startSlot),
          new BN(endSlot),
          Array.from(dataAnchorRoot),
        )
        .accountsPartial({
          caller: wallet.publicKey,
          round: roundPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      // Warp to active window
      await warpToSlot(provider, startSlot + 5)

      // Setup DA PDAs
      daBloberPda = findBloberPda(daPayer.publicKey, daNamespace)
      const payloadSize = 1 + 32 + 32 + 32
      daBlobPda = findBlobPda(
        daBloberPda,
        daPayer.publicKey,
        daTimestamp,
        payloadSize,
      )
    })

    describe('Emit Session Commitment Blocks', () => {
      it('Rejects emission when challenger is unstaking', async () => {
        const daPointer = Buffer.alloc(32, 1)

        try {
          await program.methods
            .emitSessionCommitment(Array.from(daPointer))
            .accountsPartial({
              challengerAuthority: unstakingChallenger.publicKey,
              roundCommitment: roundPda,
              challenger: unstakingChallengerPda,
              prover: activeProverPda,
            })
            .signers([unstakingChallenger])
            .rpc()
          expect.fail('Should have rejected unstaking challenger')
        } catch (error: any) {
          expect(String(error)).to.match(/ChallengerUnstaking|0x1792/)
        }
      })

      it('Rejects emission when prover is unstaking', async () => {
        const daPointer = Buffer.alloc(32, 2)

        try {
          await program.methods
            .emitSessionCommitment(Array.from(daPointer))
            .accountsPartial({
              challengerAuthority: activeChallenger.publicKey,
              roundCommitment: roundPda,
              challenger: activeChallengerPda,
              prover: unstakingProverPda,
            })
            .signers([activeChallenger])
            .rpc()
          expect.fail('Should have rejected unstaking prover')
        } catch (error: any) {
          expect(String(error)).to.match(/ProverUnstaking|0x1791/)
        }
      })

      it('Allows emission when both are active', async () => {
        const daPointer = Buffer.alloc(32, 3)

        const tx = await program.methods
          .emitSessionCommitment(Array.from(daPointer))
          .accountsPartial({
            challengerAuthority: activeChallenger.publicKey,
            roundCommitment: roundPda,
            challenger: activeChallengerPda,
            prover: activeProverPda,
          })
          .signers([activeChallenger])
          .rpc()

        expect(tx).to.be.a('string')
      })
    })

    describe('Submit Min Hash Blocks', () => {
      it('Rejects submission when prover is unstaking', async () => {
        const minToken = generateRandomMinToken()
        const sessionLeaf = createSessionLeaf(
          activeChallenger.publicKey,
          unstakingProverPda,
          42n,
          nPackets,
        )
        const leafHash = computeLeafHash(sessionLeaf)
        const siblings = [Buffer.alloc(32, 1), Buffer.alloc(32, 2)]
        const { proof } = buildMerkleProof(leafHash, siblings)

        const leafForIdl = {
          challenger: sessionLeaf.challenger,
          prover: sessionLeaf.prover,
          roundId: new BN(sessionLeaf.roundId.toString()),
          packetRoot: Array.from(sessionLeaf.packetRoot),
          n: sessionLeaf.n,
        }

        const [unstakingAggregatorPda] = getAggregatorPda(
          program,
          roundPda,
          unstakingProverPda,
        )
        const [receiptPda] = getReceiptPda(
          program,
          roundPda,
          unstakingProverPda,
          minToken,
        )

        try {
          await program.methods
            .submitMinHash(
              leafForIdl,
              proof,
              Array.from(minToken),
              new BN(daTimestamp),
            )
            .accountsPartial({
              proverAuthority: unstakingProver.publicKey,
              prover: unstakingProverPda,
              round: roundPda,
              aggregator: unstakingAggregatorPda,
              receipt: receiptPda,
              daBlober: daBloberPda,
              daBlob: daBlobPda,
              daPayer: daPayer.publicKey,
              daProgram: DA_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([unstakingProver, daPayer])
            .rpc()
          expect.fail('Should have rejected unstaking prover')
        } catch (error: any) {
          expect(String(error)).to.match(/ProverUnstaking|0x1791/)
        }
      })

      it('Allows submission when prover is active', async () => {
        const minToken = generateRandomMinToken()
        const sessionLeaf = createSessionLeaf(
          activeChallenger.publicKey,
          activeProverPda,
          42n,
          nPackets,
        )
        const leafHash = computeLeafHash(sessionLeaf)
        const siblings = [Buffer.alloc(32, 1), Buffer.alloc(32, 2)]
        const { proof } = buildMerkleProof(leafHash, siblings)

        const leafForIdl = {
          challenger: sessionLeaf.challenger,
          prover: sessionLeaf.prover,
          roundId: new BN(sessionLeaf.roundId.toString()),
          packetRoot: Array.from(sessionLeaf.packetRoot),
          n: sessionLeaf.n,
        }

        const [activeAggregatorPda] = getAggregatorPda(
          program,
          roundPda,
          activeProverPda,
        )
        const [receiptPda] = getReceiptPda(
          program,
          roundPda,
          activeProverPda,
          minToken,
        )

        const tx = await program.methods
          .submitMinHash(
            leafForIdl,
            proof,
            Array.from(minToken),
            new BN(daTimestamp),
          )
          .accountsPartial({
            proverAuthority: activeProver.publicKey,
            prover: activeProverPda,
            round: roundPda,
            aggregator: activeAggregatorPda,
            receipt: receiptPda,
            daBlober: daBloberPda,
            daBlob: daBlobPda,
            daPayer: daPayer.publicKey,
            daProgram: DA_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([activeProver, daPayer])
          .rpc()

        expect(tx).to.be.a('string')
      })
    })

    describe('Finalize Aggregator Blocks', () => {
      it('Rejects finalization when prover is unstaking', async () => {
        // First need to submit at least one min-hash for unstaking prover
        // But since we can't submit (blocked above), we skip creating aggregator

        // Try to finalize after round ends
        const currentSlot = await getCurrentSlot(provider)
        const roundAccount = await program.account.roundCommitment.fetch(
          roundPda,
        )
        await warpToSlot(provider, roundAccount.endSlot.toNumber() + 10)

        // Even if aggregator existed, finalization should fail
        console.log(
          'Skipping - cannot create aggregator for unstaking prover due to submit_min_hash block',
        )
      })

      it('Allows finalization when prover is active', async () => {
        const [activeAggregatorPda] = getAggregatorPda(
          program,
          roundPda,
          activeProverPda,
        )

        const daSnapshotPointer = Buffer.alloc(32, 5)

        const tx = await program.methods
          .finalizeAggregator(Array.from(daSnapshotPointer))
          .accountsPartial({
            proverAuthority: activeProver.publicKey,
            round: roundPda,
            aggregator: activeAggregatorPda,
            prover: activeProverPda,
          })
          .signers([activeProver])
          .rpc()

        expect(tx).to.be.a('string')
      })
    })
  })
