import * as anchor from '@coral-xyz/anchor'
import { Wallet } from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import { Pob } from '../../target/types/pob'
import { expect } from 'chai'
import { beforeAll, describe, it } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js'
import {
  getPobConfigPda,
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
  SessionLeaf,
} from '../../sdk/utils/pob'
import { getPobProvider, pobMock } from './pob-setup'
import { getProverPda, getChallengerPda } from '../../sdk/pda/pob'

export const integrationTests = () =>
  describe('Proof of Bandwidth - Full Integration', () => {
    let wallet: Wallet
    let program: Program<Pob>
    let provider: BankrunProvider

    // Test accounts (from shared mock)
    let prover: Keypair
    let challenger: Keypair
    let daPayer: Keypair

    // PDAs
    let proverPda: PublicKey
    let challengerPda: PublicKey
    let roundPda: PublicKey
    let aggregatorPda: PublicKey
    let receiptPda: PublicKey
    let daBloberPda: PublicKey
    let daBlobPda: PublicKey

    // Test data
    let seed: Buffer
    let minToken: Buffer
    let dataAnchorRoot: Buffer
    let sessionLeaf: SessionLeaf
    let merkleProof: { siblings: number[][] }
    const nPackets = 100
    const nRounds = 10
    const daTimestamp = 1_717_981_200
    const daNamespace = 'nitro'
    let startSlot: number
    let endSlot: number

    beforeAll(async () => {
      // Use shared provider (startAnchor called only once)
      provider = await getPobProvider()

      // Get references from shared mock
      wallet = pobMock.wallet!
      program = pobMock.program!
      prover = pobMock.prover!
      challenger = pobMock.challenger!
      daPayer = pobMock.daPayer!

      // Derive PDAs (accounts registered by core tests)
      ;[proverPda] = getProverPda(program, prover.publicKey)
      ;[challengerPda] = getChallengerPda(program, challenger.publicKey)

      // Generate test data with unique seed to avoid PDA collisions
      seed = generateRandomSeed()
      minToken = generateRandomMinToken()
      ;[roundPda] = getRoundCommitmentPda(program, seed)

      // Set up Data Anchor
      // Note: daBloberPda is pre-initialized in pob-setup.ts with correct owner
      daBloberPda = findBloberPda(daPayer.publicKey, daNamespace)
      const payloadSize = 1 + 32 + 32 + 32 // version + round + prover_authority + min_token
      daBlobPda = findBlobPda(
        daBloberPda,
        daPayer.publicKey,
        daTimestamp,
        payloadSize,
      )
    })

    it('Step 1: Verify prover and challenger are registered', async () => {
      // Prover and challenger are already registered by setupPob()
      // Just verify they exist

      const proverAccount = await program.account.prover.fetch(proverPda)
      expect(proverAccount.authority.toString()).to.equal(
        prover.publicKey.toString(),
      )
      expect(proverAccount.reputation).to.equal(1000)

      const challengerAccount = await program.account.challenger.fetch(
        challengerPda,
      )
      expect(challengerAccount.authority.toString()).to.equal(
        challenger.publicKey.toString(),
      )
      expect(challengerAccount.reputation).to.equal(1000)
    })

    it('Step 2: Initialize challenge round with valid DA root', async () => {
      // Create session leaf and merkle proof
      sessionLeaf = createSessionLeaf(
        challenger.publicKey,
        proverPda,
        42n,
        nPackets,
      )
      const leafHash = computeLeafHash(sessionLeaf)
      const siblings = [Buffer.alloc(32, 1), Buffer.alloc(32, 2)]
      const { root, proof } = buildMerkleProof(leafHash, siblings)
      dataAnchorRoot = root
      merkleProof = proof

      // Set up slot timing
      const currentSlot = await getCurrentSlot(provider)
      startSlot = currentSlot + 10
      endSlot = startSlot + 1000

      // Initialize round
      const tx = await program.methods
        .initChallengeRound(
          Array.from(seed),
          nPackets,
          nRounds,
          new BN(startSlot),
          new BN(endSlot),
          Array.from(dataAnchorRoot),
        )
        .accountsPartial({
          challengerAuthority: challenger.publicKey,
          challenger: challengerPda,
          round: roundPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([challenger])
        .rpc()

      expect(tx).to.be.a('string')

      // Verify round creation
      const roundAccount = await program.account.roundCommitment.fetch(roundPda)
      expect(roundAccount.nPackets).to.equal(nPackets)
      expect(roundAccount.nRounds).to.equal(nRounds)
      expect(roundAccount.startSlot.toNumber()).to.equal(startSlot)
      expect(roundAccount.endSlot.toNumber()).to.equal(endSlot)
      expect(Buffer.from(roundAccount.dataAnchorRoot)).to.deep.equal(
        dataAnchorRoot,
      )
    })

    it('Step 3: Emit session commitment during active window', async () => {
      // Warp to active slot window
      await warpToSlot(provider, startSlot + 5)

      const daPointer = Buffer.alloc(32, 3)

      const tx = await program.methods
        .emitSessionCommitment(Array.from(daPointer))
        .accountsPartial({
          challengerAuthority: challenger.publicKey,
          roundCommitment: roundPda,
          challenger: challengerPda,
          prover: proverPda,
        })
        .signers([challenger])
        .rpc()

      expect(tx).to.be.a('string')
    })

    it('Step 4: Submit min-hash with valid merkle proof and DA', async () => {
      // Derive aggregator and receipt PDAs
      ;[aggregatorPda] = getAggregatorPda(program, roundPda, proverPda)
      ;[receiptPda] = getReceiptPda(program, roundPda, proverPda, minToken)

      // Convert session leaf to IDL format
      const leafForIdl = {
        challenger: sessionLeaf.challenger,
        prover: sessionLeaf.prover,
        roundId: new BN(sessionLeaf.roundId.toString()),
        packetRoot: Array.from(sessionLeaf.packetRoot),
        n: sessionLeaf.n,
      }

      const tx = await program.methods
        .submitMinHash(
          leafForIdl,
          merkleProof,
          Array.from(minToken),
          new BN(daTimestamp),
        )
        .accountsPartial({
          proverAuthority: prover.publicKey,
          prover: proverPda,
          round: roundPda,
          aggregator: aggregatorPda,
          receipt: receiptPda,
          daBlober: daBloberPda,
          daBlob: daBlobPda,
          daPayer: daPayer.publicKey,
          daProgram: DA_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([prover, daPayer])
        .rpc()

      expect(tx).to.be.a('string')

      // Verify aggregator state
      const aggregatorAccount = await program.account.aggregator.fetch(
        aggregatorPda,
      )
      expect(aggregatorAccount.round.toString()).to.equal(roundPda.toString())
      expect(aggregatorAccount.prover.toString()).to.equal(proverPda.toString())
      expect(aggregatorAccount.numSubmissions).to.equal(1)
      expect(aggregatorAccount.finalized).to.be.false
      expect(Number(aggregatorAccount.sumNEstScaled)).to.be.greaterThan(0)

      // Verify receipt created (replay protection)
      const receiptAccount = await program.account.receipt.fetch(receiptPda)
      expect(receiptAccount.round.toString()).to.equal(roundPda.toString())
      expect(receiptAccount.prover.toString()).to.equal(proverPda.toString())
      expect(Buffer.from(receiptAccount.minToken)).to.deep.equal(minToken)
    })

    it('Step 4b: Reject replay of same min_token', async () => {
      // Try to submit the same min_token again
      const leafForIdl = {
        challenger: sessionLeaf.challenger,
        prover: sessionLeaf.prover,
        roundId: new BN(sessionLeaf.roundId.toString()),
        packetRoot: Array.from(sessionLeaf.packetRoot),
        n: sessionLeaf.n,
      }

      try {
        await program.methods
          .submitMinHash(
            leafForIdl,
            merkleProof,
            Array.from(minToken), // Same min_token
            new BN(daTimestamp),
          )
          .accountsPartial({
            proverAuthority: prover.publicKey,
            prover: proverPda,
            round: roundPda,
            aggregator: aggregatorPda,
            receipt: receiptPda,
            daBlober: daBloberPda,
            daBlob: daBlobPda,
            daPayer: daPayer.publicKey,
            daProgram: DA_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([prover, daPayer])
          .rpc()
        expect.fail('Should have rejected replay')
      } catch (error: any) {
        // Should fail due to receipt account already existing
        expect(String(error)).to.match(/already in use|custom program error/)
      }
    })

    it('Step 5: Warp past end_slot', async () => {
      await warpToSlot(provider, endSlot + 10)

      const currentSlot = await getCurrentSlot(provider)
      expect(currentSlot).to.be.greaterThan(endSlot)
    })

    it('Step 6: Finalize aggregator', async () => {
      const daSnapshotPointer = Buffer.alloc(32, 4)

      const tx = await program.methods
        .finalizeAggregator(Array.from(daSnapshotPointer))
        .accountsPartial({
          proverAuthority: prover.publicKey,
          round: roundPda,
          aggregator: aggregatorPda,
          prover: proverPda,
        })
        .signers([prover])
        .rpc()

      expect(tx).to.be.a('string')

      // Verify finalization
      const aggregatorAccount = await program.account.aggregator.fetch(
        aggregatorPda,
      )
      expect(aggregatorAccount.finalized).to.be.true
      expect(Number(aggregatorAccount.finalizedPHatScaled)).to.be.greaterThan(0)

      // Verify p_hat is capped at 1.0 (1e12 in scaled form)
      expect(Number(aggregatorAccount.finalizedPHatScaled)).to.be.at.most(
        1_000_000_000_000,
      )
    })

    it('Step 7: Close receipt after aggregator finalized', async () => {
      const tx = await program.methods
        .closeReceipt()
        .accountsPartial({
          beneficiary: prover.publicKey,
          prover: proverPda,
          receipt: receiptPda,
          aggregator: aggregatorPda,
        })
        .signers([prover])
        .rpc()

      expect(tx).to.be.a('string')

      // Verify receipt is closed
      try {
        await program.account.receipt.fetch(receiptPda)
        expect.fail('Receipt should be closed')
      } catch (error: any) {
        expect(String(error)).to.match(/Account does not exist|Could not find/)
      }
    })

    it('Step 8: Close aggregator', async () => {
      const tx = await program.methods
        .closeAggregator()
        .accountsPartial({
          beneficiary: prover.publicKey,
          prover: proverPda,
          aggregator: aggregatorPda,
        })
        .signers([prover])
        .rpc()

      expect(tx).to.be.a('string')

      // Verify aggregator is closed
      try {
        await program.account.aggregator.fetch(aggregatorPda)
        expect.fail('Aggregator should be closed')
      } catch (error: any) {
        expect(String(error)).to.match(/Account does not exist|Could not find/)
      }
    })

    it('Step 9: Close round', async () => {
      // Warp past grace period (5000 slots from config) after end_slot
      await warpToSlot(provider, endSlot + 5001)

      const [configPda] = getPobConfigPda(program)

      const tx = await program.methods
        .closeRound()
        .accountsPartial({
          beneficiary: wallet.publicKey,
          config: configPda,
          roundCommitment: roundPda,
        })
        .signers([wallet.payer])
        .rpc()

      expect(tx).to.be.a('string')

      // Verify round is closed
      try {
        await program.account.roundCommitment.fetch(roundPda)
        expect.fail('Round should be closed')
      } catch (error: any) {
        expect(String(error)).to.match(/Account does not exist|Could not find/)
      }
    })

    it('Summary: Verify complete flow executed successfully', () => {
      // All steps completed without throwing errors
      console.log('✓ Complete PoB flow executed successfully')
      console.log('  - Prover and Challenger registered')
      console.log('  - Challenge round initialized with DA root')
      console.log('  - Session commitment emitted')
      console.log('  - Min-hash submitted with DA integration')
      console.log('  - Replay protection verified')
      console.log('  - Aggregator finalized with delivery rate')
      console.log('  - Receipt closed to reclaim rent')
      console.log('  - Aggregator and round closed')
    })

    describe('Extended Aggregator Tests', () => {
      let extRoundPda: PublicKey
      let extAggregatorPda: PublicKey
      let extSeed: Buffer
      let extDataAnchorRoot: Buffer
      let extSessionLeaf: SessionLeaf
      let extMerkleProof: { siblings: number[][] }
      let extStartSlot: number
      let extEndSlot: number

      beforeAll(async () => {
        // Create a new round for extended tests
        extSeed = generateRandomSeed()
        ;[extRoundPda] = getRoundCommitmentPda(program, extSeed)
        ;[extAggregatorPda] = getAggregatorPda(program, extRoundPda, proverPda)

        // Create session leaf and merkle proof
        extSessionLeaf = createSessionLeaf(
          challenger.publicKey,
          proverPda,
          99n,
          nPackets,
        )
        const leafHash = computeLeafHash(extSessionLeaf)
        const siblings = [Buffer.alloc(32, 5), Buffer.alloc(32, 6)]
        const { root, proof } = buildMerkleProof(leafHash, siblings)
        extDataAnchorRoot = root
        extMerkleProof = proof

        // Set up slot timing
        const currentSlot = await getCurrentSlot(provider)
        extStartSlot = currentSlot + 10
        extEndSlot = extStartSlot + 1000

        // Initialize round
        await program.methods
          .initChallengeRound(
            Array.from(extSeed),
            nPackets,
            nRounds,
            new BN(extStartSlot),
            new BN(extEndSlot),
            Array.from(extDataAnchorRoot),
          )
          .accountsPartial({
            challengerAuthority: challenger.publicKey,
            challenger: challengerPda,
            round: extRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([challenger])
          .rpc()

        // Warp to active window
        await warpToSlot(provider, extStartSlot + 5)
      })

      it('Handles multiple unique min-hash submissions', async () => {
        // Submit first min-hash with unique DA blob
        const minToken1 = generateRandomMinToken()
        const [receipt1Pda] = getReceiptPda(
          program,
          extRoundPda,
          proverPda,
          minToken1,
        )

        const leafForIdl1 = {
          challenger: extSessionLeaf.challenger,
          prover: extSessionLeaf.prover,
          roundId: new BN(extSessionLeaf.roundId.toString()),
          packetRoot: Array.from(extSessionLeaf.packetRoot),
          n: extSessionLeaf.n,
        }

        // Use unique timestamp for first submission
        const daTimestamp1 = daTimestamp + 1
        const payloadSize = 1 + 32 + 32 + 32
        const daBlob1Pda = findBlobPda(
          daBloberPda,
          daPayer.publicKey,
          daTimestamp1,
          payloadSize,
        )

        await program.methods
          .submitMinHash(
            leafForIdl1,
            extMerkleProof,
            Array.from(minToken1),
            new BN(daTimestamp1),
          )
          .accountsPartial({
            proverAuthority: prover.publicKey,
            prover: proverPda,
            round: extRoundPda,
            aggregator: extAggregatorPda,
            receipt: receipt1Pda,
            daBlober: daBloberPda,
            daBlob: daBlob1Pda,
            daPayer: daPayer.publicKey,
            daProgram: DA_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([prover, daPayer])
          .rpc()

        // Verify first submission
        let aggregatorAccount = await program.account.aggregator.fetch(
          extAggregatorPda,
        )
        expect(aggregatorAccount.numSubmissions).to.equal(1)

        // Submit second min-hash with different token and unique DA blob
        const minToken2 = generateRandomMinToken()
        const [receipt2Pda] = getReceiptPda(
          program,
          extRoundPda,
          proverPda,
          minToken2,
        )

        const leafForIdl2 = {
          challenger: extSessionLeaf.challenger,
          prover: extSessionLeaf.prover,
          roundId: new BN(extSessionLeaf.roundId.toString()),
          packetRoot: Array.from(extSessionLeaf.packetRoot),
          n: extSessionLeaf.n,
        }

        // Use unique timestamp for second submission
        const daTimestamp2 = daTimestamp + 2
        const daBlob2Pda = findBlobPda(
          daBloberPda,
          daPayer.publicKey,
          daTimestamp2,
          payloadSize,
        )

        await program.methods
          .submitMinHash(
            leafForIdl2,
            extMerkleProof,
            Array.from(minToken2),
            new BN(daTimestamp2),
          )
          .accountsPartial({
            proverAuthority: prover.publicKey,
            prover: proverPda,
            round: extRoundPda,
            aggregator: extAggregatorPda,
            receipt: receipt2Pda,
            daBlober: daBloberPda,
            daBlob: daBlob2Pda,
            daPayer: daPayer.publicKey,
            daProgram: DA_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([prover, daPayer])
          .rpc()

        // Verify second submission
        aggregatorAccount = await program.account.aggregator.fetch(
          extAggregatorPda,
        )
        expect(aggregatorAccount.numSubmissions).to.equal(2)
        expect(Number(aggregatorAccount.sumNEstScaled)).to.be.greaterThan(0)
      })

      it('Rejects double finalization attempt', async () => {
        // Warp past end_slot
        await warpToSlot(provider, extEndSlot + 10)

        const daSnapshotPointer1 = Buffer.alloc(32, 7)

        // First finalization should succeed
        const tx1 = await program.methods
          .finalizeAggregator(Array.from(daSnapshotPointer1))
          .accountsPartial({
            proverAuthority: prover.publicKey,
            round: extRoundPda,
            aggregator: extAggregatorPda,
            prover: proverPda,
          })
          .signers([prover])
          .rpc()

        expect(tx1).to.be.a('string')

        // Verify finalized
        const aggregatorAccount = await program.account.aggregator.fetch(
          extAggregatorPda,
        )
        expect(aggregatorAccount.finalized).to.be.true

        // Try to finalize again with different DA pointer to avoid transaction replay
        const daSnapshotPointer2 = Buffer.alloc(32, 8)
        try {
          await program.methods
            .finalizeAggregator(Array.from(daSnapshotPointer2))
            .accountsPartial({
              proverAuthority: prover.publicKey,
              round: extRoundPda,
              aggregator: extAggregatorPda,
              prover: proverPda,
            })
            .signers([prover])
            .rpc()
          expect.fail('Should have rejected double finalization')
        } catch (error: any) {
          expect(String(error)).to.match(
            /AggregatorAlreadyFinalized|0x177c|already been processed/,
          )
        }
      })
    })
  })
