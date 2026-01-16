import * as anchor from '@coral-xyz/anchor'
import { Wallet } from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import { Pob } from '../../target/types/pob'
import { expect } from 'chai'
import { beforeAll, describe, it } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js'
import { TOKEN_PROGRAM_ID, AccountLayout } from '@solana/spl-token'
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

export const proofOfBandwidthTests = () =>
  describe('Proof of Bandwidth - Core Tests', () => {
    let wallet: Wallet
    let program: Program<Pob>
    let provider: BankrunProvider

    // Test accounts (from shared mock)
    let prover: Keypair
    let challenger: Keypair
    let daPayer: Keypair
    let stakeMint: Keypair
    let proverAta: PublicKey
    let challengerAta: PublicKey

    // PDAs (from shared mock)
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
    const nPackets = 100
    const nRounds = 10
    const daTimestamp = 1_717_981_200
    const daNamespace = 'nitro'

    beforeAll(async () => {
      try {
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

        // Derive PDAs
        ;[proverPda] = getProverPda(program, prover.publicKey)
        ;[challengerPda] = getChallengerPda(program, challenger.publicKey)

        // Generate test data
        seed = generateRandomSeed()
        minToken = generateRandomMinToken()

        // Derive PDAs specific to this test
        ;[roundPda] = getRoundCommitmentPda(program, seed)

        // Create mock DA root for testing
        const sessionLeaf = createSessionLeaf(
          challenger.publicKey,
          proverPda, // Use prover PDA, not keypair
          42n,
          nPackets,
        )
        const leafHash = computeLeafHash(sessionLeaf)
        const siblings = [Buffer.alloc(32, 1), Buffer.alloc(32, 2)]
        const { root } = buildMerkleProof(leafHash, siblings)
        dataAnchorRoot = root

        // Derive DA PDAs
        daBloberPda = findBloberPda(daPayer.publicKey, daNamespace)
        const payloadSize = 1 + 32 + 32 + 32 // version + round + prover_authority + min_token
        daBlobPda = findBlobPda(
          daBloberPda,
          daPayer.publicKey,
          daTimestamp,
          payloadSize,
        )
      } catch (error) {
        console.error('Setup error:', error)
        throw error
      }
    })

    describe('Configuration', () => {
      it('Initializes config with authority and stake mint', async () => {
        const [configPda] = getPobConfigPda(program)

        const tx = await program.methods
          .initConfig(
            new BN(4500), // round_close_grace_slots
            new BN(10_000_000_000), // prover_stake_amount (10,000 tokens with 6 decimals)
            new BN(1_000_000_000), // challenger_stake_amount (1,000 tokens with 6 decimals)
            new BN(1_512_000), // unstake_cooldown_slots (~7 days)
          )
          .accountsPartial({
            authority: wallet.publicKey,
            stakeMint: stakeMint.publicKey,
            config: configPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([wallet.payer])
          .rpc()

        expect(tx).to.be.a('string')

        // Verify config was created
        const configAccount = await program.account.config.fetch(configPda)
        expect(configAccount.authority.toString()).to.equal(
          wallet.publicKey.toString(),
        )
        expect(configAccount.stakeMint.toString()).to.equal(
          stakeMint.publicKey.toString(),
        )
        expect(configAccount.roundCloseGraceSlots.toNumber()).to.equal(4500)
        expect(configAccount.proverStakeAmount.toNumber()).to.equal(
          10_000_000_000,
        )
        expect(configAccount.challengerStakeAmount.toNumber()).to.equal(
          1_000_000_000,
        )
        expect(configAccount.unstakeCooldownSlots.toNumber()).to.equal(
          1_512_000,
        )
      })

      it('Updates config with existing authority (stake_mint unchanged)', async () => {
        const [configPda] = getPobConfigPda(program)

        const tx = await program.methods
          .updateConfig(
            new BN(5000), // round_close_grace_slots (updated)
            new BN(20_000_000_000), // prover_stake_amount (updated)
            new BN(2_000_000_000), // challenger_stake_amount (updated)
            new BN(2_000_000), // unstake_cooldown_slots (updated)
          )
          .accountsPartial({
            authority: wallet.publicKey,
            config: configPda,
          })
          .signers([wallet.payer])
          .rpc()

        expect(tx).to.be.a('string')

        // Verify config was updated
        const configAccount = await program.account.config.fetch(configPda)
        expect(configAccount.roundCloseGraceSlots.toNumber()).to.equal(5000)
        expect(configAccount.proverStakeAmount.toNumber()).to.equal(
          20_000_000_000,
        )
        expect(configAccount.unstakeCooldownSlots.toNumber()).to.equal(
          2_000_000,
        )
        expect(configAccount.challengerStakeAmount.toNumber()).to.equal(
          2_000_000_000,
        )
        // Verify stake_mint was NOT changed
        expect(configAccount.stakeMint.toString()).to.equal(
          stakeMint.publicKey.toString(),
        )
      })
    })

    describe('Registration', () => {
      it('Registers a prover with SPL token stake', async () => {
        const [configPda] = getPobConfigPda(program)
        const [proverVaultPda] = getProverVaultPda(program, proverPda)
        try {
          const tx = await program.methods
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
          expect(tx).to.be.a('string')
        } catch (error) {
          console.error('Registration error:', error)
          throw error
        }

        // Verify prover was created with correct stake
        const proverAccount = await program.account.prover.fetch(proverPda)
        expect(proverAccount.authority.toString()).to.equal(
          prover.publicKey.toString(),
        )
        expect(proverAccount.stakeAmount.toNumber()).to.equal(20_000_000_000) // Uses updated config
        expect(proverAccount.reputation).to.equal(1000)
        expect(proverAccount.unstakeRequestedSlot.toNumber()).to.equal(0)

        // Verify vault token account was created and funded
        const vaultAccountInfo = await provider.connection.getAccountInfo(
          proverVaultPda,
        )
        expect(vaultAccountInfo).to.not.be.null
        const vaultData = AccountLayout.decode(vaultAccountInfo!.data)
        expect(Number(vaultData.amount)).to.equal(20_000_000_000)
      })

      it('Registers a challenger with SPL token stake', async () => {
        const [configPda] = getPobConfigPda(program)
        const [challengerVaultPda] = getChallengerVaultPda(
          program,
          challengerPda,
        )

        const tx = await program.methods
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

        expect(tx).to.be.a('string')

        // Verify challenger was created with correct stake
        const challengerAccount = await program.account.challenger.fetch(
          challengerPda,
        )
        expect(challengerAccount.authority.toString()).to.equal(
          challenger.publicKey.toString(),
        )
        expect(challengerAccount.stakeAmount.toNumber()).to.equal(2_000_000_000) // Uses updated config
        expect(challengerAccount.reputation).to.equal(1000)
        expect(challengerAccount.unstakeRequestedSlot.toNumber()).to.equal(0)

        // Verify vault token account was created and funded
        const vaultAccountInfo = await provider.connection.getAccountInfo(
          challengerVaultPda,
        )
        expect(vaultAccountInfo).to.not.be.null
        const vaultData = AccountLayout.decode(vaultAccountInfo!.data)
        expect(Number(vaultData.amount)).to.equal(2_000_000_000)
      })
    })

    describe('Challenge Round', () => {
      it('Initializes a challenge round', async () => {
        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        // Warp to slot before start_slot to pass validation
        await warpToSlot(provider, currentSlot + 1)

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
            caller: wallet.publicKey,
            round: roundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([wallet.payer])
          .rpc()

        expect(tx).to.be.a('string')

        const roundAccount = await program.account.roundCommitment.fetch(
          roundPda,
        )
        expect(roundAccount.nPackets).to.equal(nPackets)
        expect(roundAccount.nRounds).to.equal(nRounds)
        expect(roundAccount.startSlot.toNumber()).to.equal(startSlot)
        expect(roundAccount.endSlot.toNumber()).to.equal(endSlot)
        expect(Buffer.from(roundAccount.dataAnchorRoot)).to.deep.equal(
          dataAnchorRoot,
        )
      })

      it('Emits a session commitment during active window', async () => {
        const roundAccount = await program.account.roundCommitment.fetch(
          roundPda,
        )

        // Warp to active slot window
        await warpToSlot(provider, roundAccount.startSlot.toNumber() + 5)

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

      it('Closes a round after it ends', async () => {
        // Create a fresh round for this test
        const closeSeed = generateRandomSeed()
        const [closeRoundPda] = getRoundCommitmentPda(program, closeSeed)

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 100

        await warpToSlot(provider, currentSlot + 1)

        // Initialize the round
        await program.methods
          .initChallengeRound(
            Array.from(closeSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(dataAnchorRoot),
          )
          .accountsPartial({
            caller: wallet.publicKey,
            round: closeRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([wallet.payer])
          .rpc()

        // Warp past end_slot + grace period (5000 slots from config)
        await warpToSlot(provider, endSlot + 5001)

        const [configPda] = getPobConfigPda(program)

        const tx = await program.methods
          .closeRound()
          .accountsPartial({
            beneficiary: wallet.publicKey,
            config: configPda,
            roundCommitment: closeRoundPda,
          })
          .signers([wallet.payer])
          .rpc()

        expect(tx).to.be.a('string')

        // Verify account is closed
        try {
          await program.account.roundCommitment.fetch(closeRoundPda)
          expect.fail('Round should be closed')
        } catch (error) {
          expect(String(error)).to.match(
            /Could not find|Account does not exist/,
          )
        }
      })
    })

    describe('Min Hash Submission (Simplified)', () => {
      let simplifiedRoundPda: PublicKey
      let simplifiedAggregatorPda: PublicKey
      let simplifiedSeed: Buffer

      beforeAll(async () => {
        // Create a new round for these tests since we closed the previous one
        simplifiedSeed = generateRandomSeed()
        ;[simplifiedRoundPda] = getRoundCommitmentPda(program, simplifiedSeed)

        const currentSlot = await getCurrentSlot(provider)
        const startSlot = currentSlot + 10
        const endSlot = startSlot + 1000

        // Create DA root that matches the session leaf we'll use in tests
        const sessionLeaf = createSessionLeaf(
          challenger.publicKey,
          proverPda,
          42n,
          nPackets,
        )
        const leafHash = computeLeafHash(sessionLeaf)
        const siblings = [Buffer.alloc(32, 1), Buffer.alloc(32, 2)]
        const { root } = buildMerkleProof(leafHash, siblings)
        const simplifiedDataAnchorRoot = root

        await program.methods
          .initChallengeRound(
            Array.from(simplifiedSeed),
            nPackets,
            nRounds,
            new BN(startSlot),
            new BN(endSlot),
            Array.from(simplifiedDataAnchorRoot),
          )
          .accountsPartial({
            caller: wallet.publicKey,
            round: simplifiedRoundPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([wallet.payer])
          .rpc()
        ;[simplifiedAggregatorPda] = getAggregatorPda(
          program,
          simplifiedRoundPda,
          proverPda,
        )

        // Warp to active window
        await warpToSlot(provider, startSlot + 5)
      })

      it('Finalizes an aggregator', async () => {
        // Submit a min-hash to create the aggregator
        const minToken = generateRandomMinToken()
        const [simplifiedReceiptPda] = getReceiptPda(
          program,
          simplifiedRoundPda,
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

        const daTimestamp = 1_717_999_000
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
            round: simplifiedRoundPda,
            aggregator: simplifiedAggregatorPda,
            receipt: simplifiedReceiptPda,
            daBlober: daBloberPda,
            daBlob: daBlobPda,
            daPayer: daPayer.publicKey,
            daProgram: DA_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([prover, daPayer])
          .rpc()

        // Warp past end_slot
        const roundAccount = await program.account.roundCommitment.fetch(
          simplifiedRoundPda,
        )
        await warpToSlot(provider, roundAccount.endSlot.toNumber() + 1)

        // Finalize the aggregator
        const daSnapshotPointer = Buffer.alloc(32, 4)
        const tx = await program.methods
          .finalizeAggregator(Array.from(daSnapshotPointer))
          .accountsPartial({
            proverAuthority: prover.publicKey,
            round: simplifiedRoundPda,
            aggregator: simplifiedAggregatorPda,
            prover: proverPda,
          })
          .signers([prover])
          .rpc()

        expect(tx).to.be.a('string')

        const aggregatorAccount = await program.account.aggregator.fetch(
          simplifiedAggregatorPda,
        )
        expect(aggregatorAccount.finalized).to.be.true
      })

      it('Closes an aggregator after finalization', async () => {
        const tx = await program.methods
          .closeAggregator()
          .accountsPartial({
            beneficiary: prover.publicKey,
            prover: proverPda,
            aggregator: simplifiedAggregatorPda,
          })
          .signers([prover])
          .rpc()

        expect(tx).to.be.a('string')

        // Verify account is closed
        try {
          await program.account.aggregator.fetch(simplifiedAggregatorPda)
          expect.fail('Aggregator should be closed')
        } catch (error) {
          expect(String(error)).to.match(
            /Account does not exist|Could not find/,
          )
        }
      })
    })

    // Note: Full submit_min_hash tests with Data Anchor integration
    // are in 12_integration.ts due to complexity of DA setup
  })
