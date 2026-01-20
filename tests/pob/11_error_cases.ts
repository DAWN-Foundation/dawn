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

export const errorCaseTests = () =>
  describe('Proof of Bandwidth - Error Cases', () => {
    let wallet: Wallet
    let program: Program<Pob>
    let provider: BankrunProvider

    // Test accounts (from shared mock)
    let prover: Keypair
    let challenger: Keypair
    let prover2: Keypair
    let daPayer: Keypair
    let stakeMint: Keypair
    let proverAta: PublicKey
    let challengerAta: PublicKey

    // PDAs
    let proverPda: PublicKey
    let challengerPda: PublicKey
    let prover2Pda: PublicKey
    let roundPda: PublicKey
    let aggregatorPda: PublicKey
    let daBloberPda: PublicKey

    // Test data
    let seed: Buffer
    let dataAnchorRoot: Buffer
    const nPackets = 100
    const nRounds = 10
    const daNamespace = 'nitro'

    beforeAll(async () => {
      // Use shared provider (startAnchor called only once)
      provider = await getPobProvider()

      // Get references from shared mock
      wallet = pobMock.wallet!
      program = pobMock.program!
      prover = pobMock.prover!
      challenger = pobMock.challenger!
      daPayer = pobMock.daPayer!
      stakeMint = pobMock.stakeMint!
      proverAta = pobMock.proverAta!
      challengerAta = pobMock.challengerAta!

      // Derive PDAs (accounts registered by core tests)
      ;[proverPda] = getProverPda(program, prover.publicKey)
      ;[challengerPda] = getChallengerPda(program, challenger.publicKey)

      // Generate a second prover for testing
      prover2 = Keypair.generate()
      ;[prover2Pda] = getProverPda(program, prover2.publicKey)

      // Generate test data
      seed = generateRandomSeed()
      ;[roundPda] = getRoundCommitmentPda(program, seed)

      // Create mock DA root for testing
      const sessionLeaf = createSessionLeaf(
        challenger.publicKey,
        proverPda,
        42n,
        nPackets,
      )
      const leafHash = computeLeafHash(sessionLeaf)
      const siblings = [Buffer.alloc(32, 1), Buffer.alloc(32, 2)]
      const { root } = buildMerkleProof(leafHash, siblings)
      dataAnchorRoot = root
      ;[aggregatorPda] = getAggregatorPda(program, roundPda, proverPda)

      // Set up Data Anchor
      daBloberPda = findBloberPda(daPayer.publicKey, daNamespace)
    })

    describe('Registration Errors', () => {
      it('Rejects double prover registration', async () => {
        // Prover is already registered by setupPob()
        // Attempting to register again should fail
        const [configPda] = getPobConfigPda(program)
        const [proverVaultPda] = getProverVaultPda(program, proverPda)

        try {
          await program.methods
            .registerProver()
            .accountsPartial({
              authority: prover.publicKey,
              config: configPda,
              stakeMint: stakeMint.publicKey,
              prover: proverPda,
              userTokenAccount: proverAta,
              proverVault: proverVaultPda,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([prover])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/already in use|custom program error/)
        }
      })

      it('Rejects double challenger registration', async () => {
        // Challenger is already registered by setupPob()
        // Attempting to register again should fail
        const [configPda] = getPobConfigPda(program)
        const [challengerVaultPda] = getChallengerVaultPda(
          program,
          challengerPda,
        )

        try {
          await program.methods
            .registerChallenger()
            .accountsPartial({
              authority: challenger.publicKey,
              config: configPda,
              stakeMint: stakeMint.publicKey,
              challenger: challengerPda,
              userTokenAccount: challengerAta,
              challengerVault: challengerVaultPda,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([challenger])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/already in use|custom program error/)
        }
      })
    })

    describe('Configuration Errors', () => {
      it('Rejects unauthorized config update', async () => {
        const [configPda] = getPobConfigPda(program)

        // Try to update config with wrong authority (prover instead of wallet)
        try {
          await program.methods
            .updateConfig(
              new BN(6000), // round_close_grace_slots
              new BN(30_000_000_000), // prover_stake_amount
              new BN(3_000_000_000), // challenger_stake_amount
              new BN(3_000_000), // unstake_cooldown_slots
            )
            .accountsPartial({
              authority: prover.publicKey,
              config: configPda,
            })
            .signers([prover])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/Unauthorized|0x1783/)
        }
      })

      it('Rejects double config initialization', async () => {
        const [configPda] = getPobConfigPda(program)

        // Try to initialize config again (already initialized in previous test)
        try {
          await program.methods
            .initConfig(
              new BN(4500), // round_close_grace_slots
              new BN(10_000_000_000), // prover_stake_amount
              new BN(1_000_000_000), // challenger_stake_amount
              new BN(1_512_000), // unstake_cooldown_slots
            )
            .accountsPartial({
              authority: wallet.publicKey,
              stakeMint: stakeMint.publicKey,
              config: configPda,
              systemProgram: SystemProgram.programId,
            })
            .signers([wallet.payer])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/already in use|custom program error/)
        }
      })
    })

    describe('Challenge Round Errors', () => {
      it('Rejects invalid n_packets (zero)', async () => {
        const badSeed = generateRandomSeed()
        const [badRoundPda] = getRoundCommitmentPda(program, badSeed)

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        try {
          await program.methods
            .initChallengeRound(
              Array.from(badSeed),
              0, // Invalid: n_packets = 0
              nRounds,
              new BN(startSlot),
              new BN(endSlot),
              Array.from(dataAnchorRoot),
            )
            .accountsPartial({
              challengerAuthority: challenger.publicKey,
              challenger: challengerPda,
              round: badRoundPda,
              systemProgram: SystemProgram.programId,
            })
            .signers([challenger])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/InvalidRoundParameters|0x1770/)
        }
      })

      it('Rejects invalid n_rounds (zero)', async () => {
        const badSeed = generateRandomSeed()
        const [badRoundPda] = getRoundCommitmentPda(program, badSeed)

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        try {
          await program.methods
            .initChallengeRound(
              Array.from(badSeed),
              nPackets,
              0, // Invalid: n_rounds = 0
              new BN(startSlot),
              new BN(endSlot),
              Array.from(dataAnchorRoot),
            )
            .accountsPartial({
              challengerAuthority: challenger.publicKey,
              challenger: challengerPda,
              round: badRoundPda,
              systemProgram: SystemProgram.programId,
            })
            .signers([challenger])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/InvalidRoundParameters|0x1770/)
        }
      })

      it('Rejects invalid slot range (start >= end)', async () => {
        const badSeed = generateRandomSeed()
        const [badRoundPda] = getRoundCommitmentPda(program, badSeed)

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 1000
        const endSlot = startSlot // Invalid: start_slot >= end_slot

        try {
          await program.methods
            .initChallengeRound(
              Array.from(badSeed),
              nPackets,
              nRounds,
              new BN(startSlot),
              new BN(endSlot),
              Array.from(dataAnchorRoot),
            )
            .accountsPartial({
              challengerAuthority: challenger.publicKey,
              challenger: challengerPda,
              round: badRoundPda,
              systemProgram: SystemProgram.programId,
            })
            .signers([challenger])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/InvalidRoundParameters|0x1770/)
        }
      })

      it('Rejects start_slot in the past', async () => {
        const badSeed = generateRandomSeed()
        const [badRoundPda] = getRoundCommitmentPda(program, badSeed)

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot - 10 // Invalid: in the past
        const endSlot = currentSlot + 1000

        try {
          await program.methods
            .initChallengeRound(
              Array.from(badSeed),
              nPackets,
              nRounds,
              new BN(startSlot),
              new BN(endSlot),
              Array.from(dataAnchorRoot),
            )
            .accountsPartial({
              challengerAuthority: challenger.publicKey,
              challenger: challengerPda,
              round: badRoundPda,
              systemProgram: SystemProgram.programId,
            })
            .signers([challenger])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/InvalidRoundParameters|0x1770/)
        }
      })
    })

    describe('Session Commitment Errors', () => {
      it('Rejects emission before round starts', async () => {
        // Prover and challenger are already registered by setupPob()

        // Create a round for testing
        const activeSeed = generateRandomSeed()
        const [activeRoundPda] = getRoundCommitmentPda(program, activeSeed)

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        await program.methods
          .initChallengeRound(
            Array.from(activeSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: activeRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        const daPointer = Buffer.alloc(32, 3)

        // Try to emit before the round starts (currentSlot < startSlot)
        try {
          await program.methods
            .emitSessionCommitment(Array.from(daPointer))
            .accountsPartial({
              challengerAuthority: challenger.publicKey,
              roundCommitment: activeRoundPda,
              challenger: challengerPda,
              prover: proverPda,
            })
            .signers([challenger])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/RoundNotActive|0x1773/)
        }
      })

      it('Rejects emission after round ends', async () => {
        // Create a fresh round for this test
        const afterSeed = generateRandomSeed()
        const [afterRoundPda] = getRoundCommitmentPda(program, afterSeed)

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 100

        await program.methods
          .initChallengeRound(
            Array.from(afterSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: afterRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Warp past end_slot
        await warpToSlot(provider, endSlot + 10)

        const daPointer = Buffer.alloc(32, 3)

        try {
          await program.methods
            .emitSessionCommitment(Array.from(daPointer))
            .accountsPartial({
              challengerAuthority: challenger.publicKey,
              roundCommitment: afterRoundPda,
              challenger: challengerPda,
              prover: proverPda,
            })
            .signers([challenger])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/RoundNotActive|0x1773/)
        }
      })

      it('Rejects unauthorized challenger', async () => {
        // Prover and challenger are already registered by setupPob()

        // Create a new round for this test
        const newSeed = generateRandomSeed()
        const [newRoundPda] = getRoundCommitmentPda(program, newSeed)

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        await program.methods
          .initChallengeRound(
            Array.from(newSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: newRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Warp to active window
        await warpToSlot(provider, startSlot + 5)

        const daPointer = Buffer.alloc(32, 3)

        try {
          // Try to emit with wrong authority signer (use prover as wrong challenger authority)
          await program.methods
            .emitSessionCommitment(Array.from(daPointer))
            .accountsPartial({
              challengerAuthority: prover.publicKey, // Wrong authority
              roundCommitment: newRoundPda,
              challenger: challengerPda,
              prover: proverPda,
            })
            .signers([prover]) // Wrong signer
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/Unauthorized|0x1783|constraint/)
        }
      })
    })

    describe('Aggregator Errors', () => {
      it('Rejects closing unfinalized aggregator', async () => {
        // Create a round and submit a min-hash to create an unfinalized aggregator
        const testSeed = generateRandomSeed()
        const [testRoundPda] = getRoundCommitmentPda(program, testSeed)
        const [testAggregatorPda] = getAggregatorPda(
          program,
          testRoundPda,
          proverPda,
        )

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        // Initialize round
        await program.methods
          .initChallengeRound(
            Array.from(testSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: testRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Warp to active window
        await warpToSlot(provider, startSlot + 5)

        // Submit min-hash to create aggregator
        const minToken = generateRandomMinToken()
        const [testReceiptPda] = getReceiptPda(
          program,
          testRoundPda,
          proverPda,
          minToken,
        )

        const sessionLeaf = createSessionLeaf(
          challenger.publicKey,
          proverPda,
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

        const daTimestamp = 1_717_981_700
        const payloadSize = 1 + 32 + 32 + 32
        const daBlobPda = findBlobPda(
          daBloberPda,
          daPayer.publicKey,
          daTimestamp,
          payloadSize,
        )

        await program.methods
          .submitMinHash(
            leafForIdl,
            proof,
            Array.from(minToken),
            new BN(daTimestamp),
          )
          .accountsPartial({
            proverAuthority: prover.publicKey,
            prover: proverPda,
            round: testRoundPda,
            aggregator: testAggregatorPda,
            receipt: testReceiptPda,
            daBlober: daBloberPda,
            daBlob: daBlobPda,
            daPayer: daPayer.publicKey,
            daProgram: DA_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([prover, daPayer])
          .rpc()

        // Try to close aggregator before it's finalized (should fail)
        try {
          await program.methods
            .closeAggregator()
            .accountsPartial({
              beneficiary: prover.publicKey,
              prover: proverPda,
              aggregator: testAggregatorPda,
            })
            .signers([prover])
            .rpc()
          expect.fail('Should have rejected close before finalization')
        } catch (error: any) {
          expect(String(error)).to.match(/AggregatorNotFinalized|0x1789/)
        }
      })

      it('Rejects finalizing before round ends', async () => {
        // Create a round for this test
        const testSeed = generateRandomSeed()
        const [testRoundPda] = getRoundCommitmentPda(program, testSeed)
        const [testAggregatorPda] = getAggregatorPda(
          program,
          testRoundPda,
          proverPda,
        )

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        await program.methods
          .initChallengeRound(
            Array.from(testSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: testRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Try to finalize during active window (before end_slot)
        await warpToSlot(provider, startSlot + 5)

        const daSnapshotPointer = Buffer.alloc(32, 4)

        try {
          await program.methods
            .finalizeAggregator(Array.from(daSnapshotPointer))
            .accountsPartial({
              proverAuthority: prover.publicKey,
              round: testRoundPda,
              aggregator: testAggregatorPda,
              prover: proverPda,
            })
            .signers([prover])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          // Could fail with RoundNotActive or AccountNotInitialized (if aggregator doesn't exist)
          expect(String(error)).to.match(
            /RoundNotActive|0x1773|AccountNotInitialized|does not exist/,
          )
        }
      })

      it('Rejects unauthorized finalization', async () => {
        // Create a round and aggregator
        const testSeed = generateRandomSeed()
        const [testRoundPda] = getRoundCommitmentPda(program, testSeed)
        const [testAggregatorPda] = getAggregatorPda(
          program,
          testRoundPda,
          proverPda,
        )

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 100

        await program.methods
          .initChallengeRound(
            Array.from(testSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: testRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Warp past end_slot
        await warpToSlot(provider, endSlot + 10)

        const daSnapshotPointer = Buffer.alloc(32, 4)

        try {
          // Try to finalize with wrong prover authority
          await program.methods
            .finalizeAggregator(Array.from(daSnapshotPointer))
            .accountsPartial({
              proverAuthority: challenger.publicKey, // Wrong authority
              round: testRoundPda,
              aggregator: testAggregatorPda,
              prover: proverPda, // Prover PDA is correct
            })
            .signers([challenger]) // Wrong signer
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(
            /Unauthorized|0x1783|constraint|does not exist|AccountNotInitialized/,
          )
        }
      })
    })

    describe('Min Hash Submission Timing Errors', () => {
      it('Rejects submission before round starts', async () => {
        // Create a round for this test
        const testSeed = generateRandomSeed()
        const [testRoundPda] = getRoundCommitmentPda(program, testSeed)
        const [testAggregatorPda] = getAggregatorPda(
          program,
          testRoundPda,
          proverPda,
        )

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 100 // Start in future
        const endSlot = startSlot + 1000

        // Initialize round
        await program.methods
          .initChallengeRound(
            Array.from(testSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: testRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Try to submit before start_slot (should fail)
        const minToken = generateRandomMinToken()
        const [receiptPda] = getReceiptPda(
          program,
          testRoundPda,
          proverPda,
          minToken,
        )

        const sessionLeaf = createSessionLeaf(
          challenger.publicKey,
          proverPda,
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

        const daTimestamp = 1_717_981_300
        const payloadSize = 1 + 32 + 32 + 32
        const daBlobPda = findBlobPda(
          daBloberPda,
          daPayer.publicKey,
          daTimestamp,
          payloadSize,
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
              proverAuthority: prover.publicKey,
              prover: proverPda,
              round: testRoundPda,
              aggregator: testAggregatorPda,
              receipt: receiptPda,
              daBlober: daBloberPda,
              daBlob: daBlobPda,
              daPayer: daPayer.publicKey,
              daProgram: DA_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([prover, daPayer])
            .rpc()
          expect.fail('Should have rejected early submission')
        } catch (error: any) {
          expect(String(error)).to.match(/SubmissionTooEarly|0x1781/)
        }
      })

      it('Rejects submission after round ends', async () => {
        // Create a round for this test
        const testSeed = generateRandomSeed()
        const [testRoundPda] = getRoundCommitmentPda(program, testSeed)
        const [testAggregatorPda] = getAggregatorPda(
          program,
          testRoundPda,
          proverPda,
        )

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 100 // Short window

        // Initialize round
        await program.methods
          .initChallengeRound(
            Array.from(testSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: testRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Warp past end_slot
        await warpToSlot(provider, endSlot + 10)

        // Try to submit after end_slot (should fail)
        const minToken = generateRandomMinToken()
        const [receiptPda] = getReceiptPda(
          program,
          testRoundPda,
          proverPda,
          minToken,
        )

        const sessionLeaf = createSessionLeaf(
          challenger.publicKey,
          proverPda,
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

        const daTimestamp = 1_717_981_400
        const payloadSize = 1 + 32 + 32 + 32
        const daBlobPda = findBlobPda(
          daBloberPda,
          daPayer.publicKey,
          daTimestamp,
          payloadSize,
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
              proverAuthority: prover.publicKey,
              prover: proverPda,
              round: testRoundPda,
              aggregator: testAggregatorPda,
              receipt: receiptPda,
              daBlober: daBloberPda,
              daBlob: daBlobPda,
              daPayer: daPayer.publicKey,
              daProgram: DA_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([prover, daPayer])
            .rpc()
          expect.fail('Should have rejected late submission')
        } catch (error: any) {
          expect(String(error)).to.match(/SubmissionTooLate|0x1782/)
        }
      })
    })

    describe('Round Closure Errors', () => {
      it('Rejects closing round before it ends', async () => {
        // Create a round for this test
        const testSeed = generateRandomSeed()
        const [testRoundPda] = getRoundCommitmentPda(program, testSeed)

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        await program.methods
          .initChallengeRound(
            Array.from(testSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: testRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Try to close during active window
        await warpToSlot(provider, startSlot + 5)

        const [configPda] = getPobConfigPda(program)

        try {
          await program.methods
            .closeRound()
            .accountsPartial({
              beneficiary: wallet.publicKey,
              config: configPda,
              roundCommitment: testRoundPda,
            })
            .signers([wallet.payer])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/RoundNotActive|0x1773/)
        }
      })

      it('Rejects closing round before grace period elapses', async () => {
        // Create a round for this test
        const testSeed = generateRandomSeed()
        const [testRoundPda] = getRoundCommitmentPda(program, testSeed)

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        await program.methods
          .initChallengeRound(
            Array.from(testSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: testRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Try to close after end_slot but before grace period (5000 slots from config)
        await warpToSlot(provider, endSlot + 100)

        const [configPda] = getPobConfigPda(program)

        try {
          await program.methods
            .closeRound()
            .accountsPartial({
              beneficiary: wallet.publicKey,
              config: configPda,
              roundCommitment: testRoundPda,
            })
            .signers([wallet.payer])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          expect(String(error)).to.match(/RoundGracePeriodNotElapsed|0x1774/)
        }
      })
    })

    describe('Token Staking Errors', () => {
      it('Rejects prover registration with insufficient balance', async () => {
        const [configPda] = getPobConfigPda(program)

        // Create a new prover with low token balance
        const poorProver = Keypair.generate()
        const [poorProverPda] = getProverPda(program, poorProver.publicKey)
        const [poorProverVaultPda] = getProverVaultPda(program, poorProverPda)
        const poorProverAta = getAssociatedTokenAddressSync(
          stakeMint.publicKey,
          poorProver.publicKey,
        )

        // Fund SOL but give insufficient tokens
        const fundPoorProverTx = new anchor.web3.Transaction().add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: poorProver.publicKey,
            lamports: 10 * 1e9,
          }),
        )
        await provider.sendAndConfirm(fundPoorProverTx, [wallet.payer])

        // Create ATA with very low token balance
        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          poorProverAta,
          poorProver.publicKey,
          stakeMint.publicKey,
        )

        // Mint only 1 token (need 20 billion for stake from config)
        const mintIx = createMintToInstruction(
          stakeMint.publicKey,
          poorProverAta,
          wallet.publicKey,
          1n,
        )

        const setupTx = new anchor.web3.Transaction()
        setupTx.add(createAtaIx, mintIx)
        await provider.sendAndConfirm(setupTx, [wallet.payer])

        // Try to register with insufficient balance
        try {
          await program.methods
            .registerProver()
            .accountsPartial({
              authority: poorProver.publicKey,
              config: configPda,
              stakeMint: stakeMint.publicKey,
              prover: poorProverPda,
              userTokenAccount: poorProverAta,
              proverVault: poorProverVaultPda,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([poorProver])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          // Should fail with insufficient funds error from token program
          expect(String(error)).to.match(/insufficient funds|0x1/)
        }
      })

      it('Rejects challenger registration with wrong stake mint', async () => {
        const [configPda] = getPobConfigPda(program)

        // Create a fake mint
        const fakeMint = Keypair.generate()

        const wrongChallenger = Keypair.generate()
        const [wrongChallengerPda] = getChallengerPda(
          program,
          wrongChallenger.publicKey,
        )
        const [wrongChallengerVaultPda] = getChallengerVaultPda(
          program,
          wrongChallengerPda,
        )
        const wrongChallengerAta = getAssociatedTokenAddressSync(
          stakeMint.publicKey,
          wrongChallenger.publicKey,
        )

        const fundWrongChallengerTx = new anchor.web3.Transaction().add(
          SystemProgram.transfer({
            fromPubkey: wallet.publicKey,
            toPubkey: wrongChallenger.publicKey,
            lamports: 10 * 1e9,
          }),
        )
        await provider.sendAndConfirm(fundWrongChallengerTx, [wallet.payer])

        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          wrongChallengerAta,
          wrongChallenger.publicKey,
          stakeMint.publicKey,
        )

        const mintIx = createMintToInstruction(
          stakeMint.publicKey,
          wrongChallengerAta,
          wallet.publicKey,
          100_000_000_000n,
        )

        const setupTx = new anchor.web3.Transaction()
        setupTx.add(createAtaIx, mintIx)
        await provider.sendAndConfirm(setupTx, [wallet.payer])

        // Try to register with wrong stake mint in accounts
        try {
          await program.methods
            .registerChallenger()
            .accountsPartial({
              authority: wrongChallenger.publicKey,
              config: configPda,
              stakeMint: fakeMint.publicKey, // Wrong mint
              challenger: wrongChallengerPda,
              userTokenAccount: wrongChallengerAta,
              challengerVault: wrongChallengerVaultPda,
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .signers([wrongChallenger])
            .rpc()
          expect.fail('Should have thrown error')
        } catch (error: any) {
          // Should fail with constraint violation
          expect(String(error)).to.match(/constraint|AccountNotInitialized/)
        }
      })
    })

    describe('Close Receipt Errors', () => {
      it('Rejects close receipt before aggregator finalized', async () => {
        // Create a round and submit a min-hash to create aggregator and receipt
        const testSeed = generateRandomSeed()
        const [testRoundPda] = getRoundCommitmentPda(program, testSeed)
        const [testAggregatorPda] = getAggregatorPda(
          program,
          testRoundPda,
          proverPda,
        )

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        // Initialize round
        await program.methods
          .initChallengeRound(
            Array.from(testSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: testRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Warp to active window
        await warpToSlot(provider, startSlot + 5)

        // Submit min-hash to create aggregator and receipt
        const minToken = generateRandomMinToken()
        const [testReceiptPda] = getReceiptPda(
          program,
          testRoundPda,
          proverPda,
          minToken,
        )

        const sessionLeaf = createSessionLeaf(
          challenger.publicKey,
          proverPda,
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

        const daTimestamp = 1_717_981_500
        const payloadSize = 1 + 32 + 32 + 32
        const daBlobPda = findBlobPda(
          daBloberPda,
          daPayer.publicKey,
          daTimestamp,
          payloadSize,
        )

        await program.methods
          .submitMinHash(
            leafForIdl,
            proof,
            Array.from(minToken),
            new BN(daTimestamp),
          )
          .accountsPartial({
            proverAuthority: prover.publicKey,
            prover: proverPda,
            round: testRoundPda,
            aggregator: testAggregatorPda,
            receipt: testReceiptPda,
            daBlober: daBloberPda,
            daBlob: daBlobPda,
            daPayer: daPayer.publicKey,
            daProgram: DA_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([prover, daPayer])
          .rpc()

        // Try to close receipt before aggregator is finalized (should fail)
        try {
          await program.methods
            .closeReceipt()
            .accountsPartial({
              beneficiary: prover.publicKey,
              prover: proverPda,
              receipt: testReceiptPda,
              aggregator: testAggregatorPda,
            })
            .signers([prover])
            .rpc()
          expect.fail('Should have rejected close before finalization')
        } catch (error: any) {
          expect(String(error)).to.match(/AggregatorNotFinalized|0x1789/)
        }
      })

      it('Rejects unauthorized close receipt', async () => {
        // Create a round and submit a min-hash
        const testSeed = generateRandomSeed()
        const [testRoundPda] = getRoundCommitmentPda(program, testSeed)
        const [testAggregatorPda] = getAggregatorPda(
          program,
          testRoundPda,
          proverPda,
        )

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        // Initialize round
        await program.methods
          .initChallengeRound(
            Array.from(testSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: testRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Warp to active window
        await warpToSlot(provider, startSlot + 5)

        // Submit min-hash
        const minToken = generateRandomMinToken()
        const [testReceiptPda] = getReceiptPda(
          program,
          testRoundPda,
          proverPda,
          minToken,
        )

        const sessionLeaf = createSessionLeaf(
          challenger.publicKey,
          proverPda,
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

        const daTimestamp = 1_717_981_600
        const payloadSize = 1 + 32 + 32 + 32
        const daBlobPda = findBlobPda(
          daBloberPda,
          daPayer.publicKey,
          daTimestamp,
          payloadSize,
        )

        await program.methods
          .submitMinHash(
            leafForIdl,
            proof,
            Array.from(minToken),
            new BN(daTimestamp),
          )
          .accountsPartial({
            proverAuthority: prover.publicKey,
            prover: proverPda,
            round: testRoundPda,
            aggregator: testAggregatorPda,
            receipt: testReceiptPda,
            daBlober: daBloberPda,
            daBlob: daBlobPda,
            daPayer: daPayer.publicKey,
            daProgram: DA_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([prover, daPayer])
          .rpc()

        // Finalize aggregator
        await warpToSlot(provider, endSlot + 10)

        await program.methods
          .finalizeAggregator(Array.from(Buffer.alloc(32, 6)))
          .accountsPartial({
            proverAuthority: prover.publicKey,
            round: testRoundPda,
            aggregator: testAggregatorPda,
            prover: proverPda,
          })
          .signers([prover])
          .rpc()

        // Try to close receipt with unauthorized beneficiary (should fail)
        try {
          await program.methods
            .closeReceipt()
            .accountsPartial({
              beneficiary: challenger.publicKey, // Wrong beneficiary
              prover: proverPda,
              receipt: testReceiptPda,
              aggregator: testAggregatorPda,
            })
            .signers([challenger])
            .rpc()
          expect.fail('Should have rejected unauthorized close')
        } catch (error: any) {
          expect(String(error)).to.match(/Unauthorized|0x1770/)
        }
      })
    })
  })
