import * as anchor from '@coral-xyz/anchor'
import { Wallet } from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import { Dawn } from '../../target/types/dawn'
import { expect } from 'chai'
import { beforeAll } from '@jest/globals'
import { BankrunProvider } from 'anchor-bankrun'
import { startAnchor } from 'solana-bankrun'
import { PROGRAM_ID } from '../../sdk/utils/helpers'
import {
  getEvent,
  mock,
  loadWallet,
  confirmTx,
  getIpLeasePda,
  getDevicePda,
  IpV4Bytes,
  getDeviceLocationPda,
  getSubscriptionPda,
  getLocalDomainPda,
} from '../../sdk/utils'

export const proofOfBandwidthTests = () =>
  describe('Proof of Bandwidth', () => {
    let wallet: Wallet
    let program: Program<Dawn>
    let provider: BankrunProvider
    let proverPda: anchor.web3.PublicKey
    let challengerPda: anchor.web3.PublicKey
    let roundCommitmentPda: anchor.web3.PublicKey
    let aggregatorPda: anchor.web3.PublicKey

    beforeAll(async () => {
      wallet = loadWallet()
      // Use the existing provider and program from the test suite
      provider = anchor.getProvider() as BankrunProvider
      provider.wallet = new Wallet(mock.serviceProvider)
      anchor.setProvider(provider)
      program = anchor.workspace.DAWN as Program<Dawn>

      ;[proverPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('prover'), wallet.payer.publicKey.toBuffer()],
        program.programId,
      )
      ;[challengerPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('challenger'), wallet.payer.publicKey.toBuffer()],
        program.programId,
      )
    })

    // beforeAll(async () => {
    //   // Generate test keypairs
    //   proverAuthority = anchor.web3.Keypair.generate()
    //   challengerAuthority = anchor.web3.Keypair.generate()

    //   // Create accounts with funding
    //   const addedAccounts = [
    //     {
    //       address: proverAuthority.publicKey,
    //       info: {
    //         lamports: 2 * anchor.web3.LAMPORTS_PER_SOL,
    //         executable: false,
    //         owner: anchor.web3.SystemProgram.programId,
    //         data: Buffer.alloc(0),
    //       },
    //     },
    //     {
    //       address: challengerAuthority.publicKey,
    //       info: {
    //         lamports: 2 * anchor.web3.LAMPORTS_PER_SOL,
    //         executable: false,
    //         owner: anchor.web3.SystemProgram.programId,
    //         data: Buffer.alloc(0),
    //       },
    //     },
    //   ]

    //   const context = await startAnchor(
    //     '.',
    //     [{ name: 'dawn', programId: PROGRAM_ID }],
    //     addedAccounts,
    //   )
    //   provider = new BankrunProvider(context)
    //   anchor.setProvider(provider)
    //   program = anchor.workspace.DAWN as Program<Dawn>

    //   // Derive PDAs
    //   ;[proverPda] = anchor.web3.PublicKey.findProgramAddressSync(
    //     [Buffer.from('prover'), proverAuthority.publicKey.toBuffer()],
    //     program.programId,
    //   )
    //   ;[challengerPda] = anchor.web3.PublicKey.findProgramAddressSync(
    //     [Buffer.from('challenger'), challengerAuthority.publicKey.toBuffer()],
    //     program.programId,
    //   )
    // })

    it('Registers a prover', async () => {
      const tx = await program.methods
        .registerProver()
        .accountsPartial({
          authority: wallet.payer.publicKey,
          prover: proverPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      console.log('Register prover transaction:', tx)

      const proverAccount = await program.account.prover.fetch(proverPda)
      expect(proverAccount.authority.toString()).to.equal(
        wallet.payer.publicKey.toString(),
      )
      expect(proverAccount.stakeLamports.toNumber()).to.equal(0)
      expect(proverAccount.reputation).to.equal(1000)
    })

    it('Registers a challenger', async () => {
      const tx = await program.methods
        .registerChallenger()
        .accountsPartial({
          authority: wallet.payer.publicKey,
          challenger: challengerPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      console.log('Register challenger transaction:', tx)

      const challengerAccount = await program.account.challenger.fetch(
        challengerPda,
      )
      expect(challengerAccount.authority.toString()).to.equal(
        wallet.payer.publicKey.toString(),
      )
      expect(challengerAccount.stakeLamports.toNumber()).to.equal(0)
      expect(challengerAccount.reputation).to.equal(1000)
    })

    xit('Initializes a challenge round', async () => {
      const seed = new Uint8Array(32).fill(1) // Simple test seed
      const nPackets = 100
      const nRounds = 10
      const currentSlot = await provider.context.banksClient.getSlot()
      const startSlot = Number(currentSlot) + 1
      const endSlot = startSlot + 1000000 // Very large end slot

      ;[roundCommitmentPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('round'), seed],
        program.programId,
      )

      const tx = await program.methods
        .initChallengeRound(
          Array.from(seed),
          nPackets,
          nRounds,
          new anchor.BN(startSlot),
          new anchor.BN(endSlot),
        )
        .accountsPartial({
          caller: wallet.payer.publicKey,
          roundCommitment: roundCommitmentPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      console.log('Init challenge round transaction:', tx)

      const roundAccount = await program.account.roundCommitment.fetch(
        roundCommitmentPda,
      )
      expect(roundAccount.nPackets).to.equal(nPackets)
      expect(roundAccount.nRounds).to.equal(nRounds)
      expect(roundAccount.startSlot.toNumber()).to.equal(startSlot)
      expect(roundAccount.endSlot.toNumber()).to.equal(endSlot)
    })

    xit('Emits a session commitment', async () => {

      // Create a round commitment
      const seed = new Uint8Array(32).fill(1)
      const nPackets = 100
      const nRounds = 10
      const currentSlot = await provider.context.banksClient.getSlot()
      const startSlot = Number(currentSlot) + 1
      const endSlot = startSlot + 1000000 // Very large end slot

      ;[roundCommitmentPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('round'), seed],
        program.programId,
      )

      // await program.methods
      //   .initChallengeRound(
      //     Array.from(seed),
      //     nPackets,
      //     nRounds,
      //     new BN(startSlot),
      //     new BN(endSlot),
      //   )
      //   .accountsPartial({
      //     caller: wallet.payer.publicKey,
      //     roundCommitment: roundCommitmentPda,
      //   })
      //   .signers([wallet.payer])
      //   .rpc()

      // Wait a bit for slot to advance
      await new Promise(resolve => setTimeout(resolve, 100))

      // Now emit session commitment
      const daPointer = new Uint8Array(32).fill(2) // Simple test pointer

      const tx = await program.methods
        .emitSessionCommitment(Array.from(daPointer))
        .accountsPartial({
          challengerAuthority: wallet.payer.publicKey,
          roundCommitment: roundCommitmentPda,
          challenger: challengerPda,
          prover: proverPda,
        })
        .signers([wallet.payer])
        .rpc()

      console.log('Emit session commitment transaction:', tx)
    })

    xit('Submits a min hash', async () => {
      // First create a round commitment
      const seed = new Uint8Array(32).fill(1)
      const nPackets = 100
      const nRounds = 10
      const currentSlot = await provider.context.banksClient.getSlot()
      const startSlot = Number(currentSlot) + 1
      const endSlot = startSlot + 1000000 // Very large end slot

      ;[roundCommitmentPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('round'), seed],
        program.programId,
      )

      // await program.methods
      //   .initChallengeRound(
      //     Array.from(seed),
      //     nPackets,
      //     nRounds,
      //     new BN(startSlot),
      //     new BN(endSlot),
      //   )
      //   .accountsPartial({
      //     caller: wallet.payer.publicKey,
      //     roundCommitment: roundCommitmentPda,
      //   })
      //   .signers([wallet.payer])
      //   .rpc()

      const token = new Uint8Array(32).fill(3) // Simple test token
      const merkleProof: number[][] = [] // Empty proof for test
      const daSessionProof = new Uint8Array(32).fill(0) // Matches data_anchor_root

      ;[aggregatorPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from('agg'),
          roundCommitmentPda.toBuffer(),
          proverPda.toBuffer(),
        ],
        program.programId,
      )

      const tx = await program.methods
        .submitMinHash(
          Array.from(token),
          merkleProof,
          Array.from(daSessionProof),
        )
        .accountsPartial({
          proverAuthority: wallet.payer.publicKey,
          roundCommitment: roundCommitmentPda,
          aggregator: aggregatorPda,
          prover: proverPda,
          challenger: challengerPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      console.log('Submit min hash transaction:', tx)

      const aggregatorAccount = await program.account.aggregator.fetch(
        aggregatorPda,
      )
      expect(aggregatorAccount.numSubmissions).to.equal(1)
      expect(aggregatorAccount.finalized).to.be.false
    })

    it('Finalizes an aggregator', async () => {
      // First create a round commitment
      const seed = new Uint8Array(32).fill(1)
      const nPackets = 100
      const nRounds = 10
      const currentSlot = await provider.context.banksClient.getSlot()
      const startSlot = Number(currentSlot) + 1
      const endSlot = startSlot + 1000000 // Very large end slot

      ;[roundCommitmentPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('round'), seed],
        program.programId,
      )

      try {
      await program.methods
        .initChallengeRound(
          Array.from(seed),
          nPackets,
          nRounds,
          new BN(startSlot),
          new BN(endSlot),
        )
        .accountsPartial({
          caller: wallet.payer.publicKey,
          roundCommitment: roundCommitmentPda,
        })
        .signers([wallet.payer])
        .rpc()
      } catch (error) {
        console.log('Init challenge round transaction error:', error)
        throw error
      }

      // Create aggregator by submitting a min hash
      const token = new Uint8Array(32).fill(3)
      const merkleProof: number[][] = []
      const daSessionProof = new Uint8Array(32).fill(0)

      ;[aggregatorPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from('agg'),
          roundCommitmentPda.toBuffer(),
          proverPda.toBuffer(),
        ],
        program.programId,
      )

      await program.methods
        .submitMinHash(
          Array.from(token),
          merkleProof,
          Array.from(daSessionProof),
        )
        .accountsPartial({
          proverAuthority: wallet.payer.publicKey,
          roundCommitment: roundCommitmentPda,
          aggregator: aggregatorPda,
          prover: proverPda,
          challenger: challengerPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      // Now finalize the aggregator
      const daSnapshotPointer = new Uint8Array(32).fill(4) // Simple test pointer

      const tx = await program.methods
        .finalizeAggregator(Array.from(daSnapshotPointer))
        .accountsPartial({
          caller: wallet.payer.publicKey,
          roundCommitment: roundCommitmentPda,
          aggregator: aggregatorPda,
          prover: proverPda,
        })
        .signers([wallet.payer])
        .rpc()

      console.log('Finalize aggregator transaction:', tx)

      const aggregatorAccount = await program.account.aggregator.fetch(
        aggregatorPda,
      )
      expect(aggregatorAccount.finalized).to.be.true
      expect(
        aggregatorAccount.finalizedPHatScaled.toNumber(),
      ).to.be.greaterThan(0)
    })

    it('Closes an aggregator', async () => {
      // First create a round commitment and aggregator
      const seed = new Uint8Array(32).fill(1)
      const nPackets = 100
      const nRounds = 10
      const currentSlot = await provider.context.banksClient.getSlot()
      const startSlot = Number(currentSlot) + 1
      const endSlot = startSlot + 1000000 // Very large end slot

      ;[roundCommitmentPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('round'), seed],
        program.programId,
      )

      await program.methods
        .initChallengeRound(
          Array.from(seed),
          nPackets,
          nRounds,
          new BN(startSlot),
          new BN(endSlot),
        )
        .accountsPartial({
          caller: wallet.payer.publicKey,
          roundCommitment: roundCommitmentPda,
        })
        .signers([wallet.payer])
        .rpc()

      // Create aggregator by submitting a min hash
      const token = new Uint8Array(32).fill(3)
      const merkleProof: number[][] = []
      const daSessionProof = new Uint8Array(32).fill(0)

      ;[aggregatorPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from('agg'),
          roundCommitmentPda.toBuffer(),
          proverPda.toBuffer(),
        ],
        program.programId,
      )

      await program.methods
        .submitMinHash(
          Array.from(token),
          merkleProof,
          Array.from(daSessionProof),
        )
        .accountsPartial({
          proverAuthority: wallet.payer.publicKey,
          roundCommitment: roundCommitmentPda,
          aggregator: aggregatorPda,
          prover: proverPda,
          challenger: challengerPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      // Finalize the aggregator first
      const daSnapshotPointer = new Uint8Array(32).fill(4)
      await program.methods
        .finalizeAggregator(Array.from(daSnapshotPointer))
        .accountsPartial({
          caller: wallet.payer.publicKey,
          roundCommitment: roundCommitmentPda,
          aggregator: aggregatorPda,
          prover: proverPda,
        })
        .signers([wallet.payer])
        .rpc()

      // Now close the aggregator
      const tx = await program.methods
        .closeAggregator()
        .accountsPartial({
          beneficiary: wallet.payer.publicKey,
          aggregator: aggregatorPda,
        })
        .signers([wallet.payer])
        .rpc()

      console.log('Close aggregator transaction:', tx)
    })

    it('Closes a round', async () => {
      // First create a round commitment
      const seed = new Uint8Array(32).fill(1)
      const nPackets = 100
      const nRounds = 10
      const currentSlot = await provider.context.banksClient.getSlot()
      const startSlot = Number(currentSlot) + 1
      const endSlot = startSlot + 1000000 // Very large end slot

      ;[roundCommitmentPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('round'), seed],
        program.programId,
      )

      await program.methods
        .initChallengeRound(
          Array.from(seed),
          nPackets,
          nRounds,
          new BN(startSlot),
          new BN(endSlot),
        )
        .accountsPartial({
          caller: wallet.payer.publicKey,
          roundCommitment: roundCommitmentPda,
        })
        .signers([wallet.payer])
        .rpc()

      // Now close the round
      const tx = await program.methods
        .closeRound()
        .accounts({
          beneficiary: wallet.payer.publicKey,
          roundCommitment: roundCommitmentPda,
        })
        .signers([wallet.payer])
        .rpc()

      console.log('Close round transaction:', tx)
    })
  })
