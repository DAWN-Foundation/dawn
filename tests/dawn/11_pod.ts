// tests/dawn.submit-min-hash.spec.ts
import * as anchor from '@coral-xyz/anchor'
import { Program, utils as anchorUtils, BN } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { Dawn } from '../../target/types/dawn'
import { mock, getProvider, loadWallet } from '../../sdk/utils'
import { BankrunProvider } from 'anchor-bankrun'
import { beforeAll, expect, describe, test } from '@jest/globals'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import crypto from 'crypto'

/* ------------------------------ hashing utils ------------------------------ */

const DOMAIN_COMBINE = Buffer.from('DA-MERKLE:v1')
const DOMAIN_LEAF = Buffer.from('DA-LEAF:v1')

function sha256(parts: (Buffer | Uint8Array)[]): Buffer {
  const h = crypto.createHash('sha256')
  for (const p of parts) h.update(p)
  return h.digest()
}

function le64(n: bigint) {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(n, 0)
  return b
}
function le32(n: number) {
  const b = Buffer.alloc(4)
  b.writeUInt32LE(n, 0)
  return b
}

type SessionLeaf = {
  challenger: PublicKey
  prover: PublicKey
  roundId: bigint
  packetRoot: Uint8Array // 32
  n: number // u32
}

// must match on-chain `SessionLeaf.hash()`
function leafHash(leaf: SessionLeaf): Buffer {
  const buf = Buffer.concat([
    Buffer.from(leaf.challenger.toBytes()),
    Buffer.from(leaf.prover.toBytes()),
    le64(leaf.roundId),
    Buffer.from(leaf.packetRoot),
    le32(leaf.n),
  ])
  return sha256([DOMAIN_LEAF, buf])
}

// order-insensitive pair combine: H(DOMAIN, min||max)
function combineOrdered(a: Buffer, b: Buffer): Buffer {
  const [lo, hi] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a]
  return sha256([DOMAIN_COMBINE, lo, hi])
}

type MerkleProofJs = { siblings: number[][] } // matches Anchor IDL vec<[u8;32]>

/* -------------------------------- test suite ------------------------------- */

export const submitMinHashTests = () =>
  describe('dawn::submit_min_hash', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>
    let coder: anchor.BorshCoder

    const wallet = loadWallet()

    // PDAs & accounts
    let roundPda: PublicKey
    let aggregatorPda: PublicKey
    let receiptPda: PublicKey

    // actors
    let prover: anchor.web3.Keypair
    let challenger: anchor.web3.Keypair

    // fixed test params
    const roundId = 42n
    const n = 10
    const packetRoot = Buffer.alloc(32, 7) // 0x07..07
    let minToken: Buffer

    // siblings we’ll use to craft the DA root
    const sib1 = Buffer.alloc(32, 1)
    const sib2 = Buffer.alloc(32, 2)

    // computed
    let dataAnchorRoot: Buffer
    let leaf: SessionLeaf
    let proof: MerkleProofJs

    beforeAll(async () => {
      provider = await getProvider()
      provider.wallet = wallet
      anchor.setProvider(provider as any)

      program = anchor.workspace.DAWN as Program<Dawn>
      coder = new anchor.BorshCoder(program.idl as any)

      prover = anchor.web3.Keypair.generate()
      challenger = anchor.web3.Keypair.generate()

      // fund prover & challenger in bankrun
      for (const kp of [prover, challenger]) {
        provider.context.setAccount(kp.publicKey, {
          lamports: 5e9, // 5 SOL for safety
          owner: SystemProgram.programId,
          executable: false,
          data: Buffer.alloc(0),
        })
      }

      // build leaf + proof and compute root
      leaf = {
        challenger: challenger.publicKey,
        prover: prover.publicKey,
        roundId,
        packetRoot,
        n,
      }
      const leafH = leafHash(leaf)
      dataAnchorRoot = combineOrdered(combineOrdered(leafH, sib1), sib2)
      proof = { siblings: [sib1, sib2].map((b) => Array.from(b)) }

      // derive PDAs you use on-chain
      roundPda = PublicKey.findProgramAddressSync(
        [Buffer.from('round'), Buffer.from('commitment'), Buffer.from(le64(roundId))],
        program.programId
      )[0]

      aggregatorPda = PublicKey.findProgramAddressSync(
        [Buffer.from('aggregator'), roundPda.toBuffer()],
        program.programId
      )[0]

      // choose a minToken and derive Receipt PDA (["receipt", round, prover, min_token])
      minToken = crypto.randomBytes(32)
    //   receiptPda = PublicKey.findProgramAddressSync(
    //     [Buffer.from('receipt'), roundPda.toBuffer(), prover.publicKey.toBuffer(), minToken],
    //     program.programId
    //   )[0]

      // seed RoundCommitment + Aggregator directly into Bankrun with IDL coder
      await seedRoundCommitment(program, coder, {
        pda: roundPda,
        authority: mock.serviceProvider.publicKey,
        seed: crypto.randomBytes(32),
        nTarget: 10,
        rParam: 1,
        dataAnchorRoot,
        roundId,
      })

      await seedAggregator(program, coder, prover.publicKey, {
        pda: aggregatorPda,
        round: roundPda,
        numSubmissions: 0n,
        sumNEstScaled: 0n,
        scale: 1_000_000_000n, // 1e9 fixed-point
      })
    })

    test('mock setup', () => {
      assert.exists(mock)
    })

    test('submit_min_hash succeeds with valid DA proof', async () => {
      const sig = await program.methods
        .submitMinHash(
          // leaf (IDL struct)
          {
            challenger: leaf.challenger,
            prover: leaf.prover,
            roundId: new BN(leaf.roundId.toString()),
            packetRoot: Array.from(leaf.packetRoot),
            n: leaf.n,
          },
          // proof
          proof,
          // min_token
          Array.from(minToken)
        )
        .accountsPartial({
          prover: prover.publicKey,
          round: roundPda,
          aggregator: aggregatorPda,
          payer: mock.serviceProvider.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([prover, mock.serviceProvider])
        .rpc()

      expect(sig).toBeTruthy()

      // check aggregator updated
      const aggr = await program.account.aggregator.fetch(aggregatorPda)
      expect(aggr.numSubmissions.toString()).toBe('1')
      expect(new BN(aggr.sumNEstScaled).gte(new BN(0))).toBeTruthy()
    })

    test('replay is rejected for same minToken', async () => {
      try {
        await program.methods
          .submitMinHash(
            {
              challenger: leaf.challenger,
              prover: leaf.prover,
              roundId: new BN(leaf.roundId.toString()),
              packetRoot: Array.from(leaf.packetRoot),
              n: leaf.n,
            },
            proof,
            Array.from(minToken)
          )
          .accountsPartial({
            prover: prover.publicKey,
            round: roundPda,
            aggregator: aggregatorPda,
            payer: mock.serviceProvider.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([prover, mock.serviceProvider])
          .rpc()
        expect(false).toBe(true) // should not reach
      } catch (e: any) {
        console.log("my error", e)
        expect(String(e.message || e)).toMatch(/Replay|already/i)
      }
    })

    test('wrong prover is rejected', async () => {
      const other = anchor.web3.Keypair.generate()
      provider.context.setAccount(other.publicKey, {
        lamports: 5e9,
        owner: SystemProgram.programId,
        executable: false,
        data: Buffer.alloc(0),
      })

      const minToken2 = crypto.randomBytes(32)
      const otherReceipt = PublicKey.findProgramAddressSync(
        [Buffer.from('receipt'), roundPda.toBuffer(), other.publicKey.toBuffer(), minToken2],
        program.programId
      )[0]

      try {
        await program.methods
          .submitMinHash(
            {
              challenger: leaf.challenger,
              prover: leaf.prover, // still original prover in leaf
              roundId: new BN(leaf.roundId.toString()),
              packetRoot: Array.from(leaf.packetRoot),
              n: leaf.n,
            },
            proof,
            Array.from(minToken2)
          )
          .accountsPartial({
            prover: other.publicKey, // signer != leaf.prover
            round: roundPda,
            aggregator: aggregatorPda,
            payer: mock.serviceProvider.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([other, mock.serviceProvider])
          .rpc()
        expect(false).toBe(true)
      } catch (e: any) {
        expect(String(e.message || e)).toMatch(/WrongProver|prover/i)
      }
    })

    test('invalid DA proof is rejected', async () => {
      const badSib = Buffer.alloc(32, 9)
      const badProof: MerkleProofJs = { siblings: [Array.from(badSib)] }
      const minToken3 = crypto.randomBytes(32)
      const badReceipt = PublicKey.findProgramAddressSync(
        [Buffer.from('receipt'), roundPda.toBuffer(), prover.publicKey.toBuffer(), minToken3],
        program.programId
      )[0]

      try {
        await program.methods
          .submitMinHash(
            {
              challenger: leaf.challenger,
              prover: leaf.prover,
              roundId: new BN(leaf.roundId.toString()),
              packetRoot: Array.from(leaf.packetRoot),
              n: leaf.n,
            },
            badProof,
            Array.from(minToken3)
          )
          .accountsPartial({
            prover: prover.publicKey,
            round: roundPda,
            aggregator: aggregatorPda,
            payer: mock.serviceProvider.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([prover, mock.serviceProvider])
          .rpc()
        expect(false).toBe(true)
      } catch (e: any) {
        expect(String(e.message || e)).toMatch(/InvalidDAInclusion|invalid/i)
      }
    })
  })

/* -------------------------- helpers: seed accounts -------------------------- */

async function seedRoundCommitment(
  program: Program<Dawn>,
  coder: anchor.BorshCoder,
  args: {
    pda: PublicKey
    authority: PublicKey
    seed: Buffer // 32
    nTarget: number
    rParam: number
    dataAnchorRoot: Buffer // 32
    roundId: bigint
  }
) {
  // shape must match your Anchor account struct
  const roundObj: any = {
    seed: Array.from(args.seed),
    expectedMinScaled: new BN(0), // 1/(N+1) stored as fixed-point (scale 1e12)
    nPackets: args.nTarget,
    nRounds: 1, // rounds per session
    startSlot: new BN(0),
    endSlot: new BN(1000),
    dataAnchorRoot: Array.from(args.dataAnchorRoot),
    bump: 255, // PDA bump seed
  }

  // Use raw Borsh encoding since account type might not be found
  const discriminator = Buffer.from([70, 119, 241, 179, 154, 116, 247, 145])
  
  // Manually encode the struct fields in order
  const encoded = Buffer.alloc(0)
  let offset = 0
  
  // seed: [u8; 32]
  const seedBuf = Buffer.from(roundObj.seed)
  // expectedMinScaled: u128 (16 bytes, little endian)
  const expectedMinBuf = Buffer.alloc(16)
  expectedMinBuf.writeBigUInt64LE(BigInt(roundObj.expectedMinScaled.toString()), 0)
  expectedMinBuf.writeBigUInt64LE(0n, 8)
  // nPackets: u32 (4 bytes, little endian)
  const nPacketsBuf = Buffer.alloc(4)
  nPacketsBuf.writeUInt32LE(roundObj.nPackets, 0)
  // nRounds: u16 (2 bytes, little endian)
  const nRoundsBuf = Buffer.alloc(2)
  nRoundsBuf.writeUInt16LE(roundObj.nRounds, 0)
  // startSlot: u64 (8 bytes, little endian)
  const startSlotBuf = Buffer.alloc(8)
  startSlotBuf.writeBigUInt64LE(BigInt(roundObj.startSlot.toString()), 0)
  // endSlot: u64 (8 bytes, little endian)
  const endSlotBuf = Buffer.alloc(8)
  endSlotBuf.writeBigUInt64LE(BigInt(roundObj.endSlot.toString()), 0)
  // dataAnchorRoot: [u8; 32]
  const dataAnchorRootBuf = Buffer.from(roundObj.dataAnchorRoot)
  // bump: u8
  const bumpBuf = Buffer.from([roundObj.bump])
  
  const data = Buffer.concat([
    discriminator,
    seedBuf,
    expectedMinBuf,
    nPacketsBuf,
    nRoundsBuf,
    startSlotBuf,
    endSlotBuf,
    dataAnchorRootBuf,
    bumpBuf
  ])

  ;(program.provider as BankrunProvider).context.setAccount(args.pda, {
    lamports: Number(10n ** 9n), // rent-ish
    owner: program.programId,
    executable: false,
    data,
  })
}

async function seedAggregator(
  program: Program<Dawn>,
  coder: anchor.BorshCoder,
  prover: PublicKey,
  args: {
    pda: PublicKey
    round: PublicKey
    numSubmissions: bigint
    sumNEstScaled: bigint
    scale: bigint
  }
) {
  const aggrObj: any = {
    round: args.round,
    prover: prover, // need to add prover field
    numSubmissions: new BN(args.numSubmissions.toString()),
    sumNEstScaled: new BN(args.sumNEstScaled.toString()),
    finalized: false,
    finalizedPHatScaled: new BN(0),
    version: 0,
    bump: 255, // PDA bump seed
  }
  // Use raw Borsh encoding for Aggregator
  const discriminator = Buffer.from([206, 139, 113, 148, 163, 34, 44, 187])
  
  // Manually encode the struct fields in order
  // round: pubkey (32 bytes)
  const roundBuf = Buffer.from(aggrObj.round.toBytes())
  // prover: pubkey (32 bytes)
  const proverBuf = Buffer.from(aggrObj.prover.toBytes())
  // numSubmissions: u32 (4 bytes, little endian)
  const numSubmissionsBuf = Buffer.alloc(4)
  numSubmissionsBuf.writeUInt32LE(Number(aggrObj.numSubmissions.toString()), 0)
  // sumNEstScaled: u128 (16 bytes, little endian)
  const sumNEstScaledBuf = Buffer.alloc(16)
  sumNEstScaledBuf.writeBigUInt64LE(BigInt(aggrObj.sumNEstScaled.toString()), 0)
  sumNEstScaledBuf.writeBigUInt64LE(0n, 8)
  // finalized: bool (1 byte)
  const finalizedBuf = Buffer.from([aggrObj.finalized ? 1 : 0])
  // finalizedPHatScaled: u128 (16 bytes, little endian)
  const finalizedPHatScaledBuf = Buffer.alloc(16)
  finalizedPHatScaledBuf.writeBigUInt64LE(BigInt(aggrObj.finalizedPHatScaled.toString()), 0)
  finalizedPHatScaledBuf.writeBigUInt64LE(0n, 8)
  // version: u32 (4 bytes, little endian)
  const versionBuf = Buffer.alloc(4)
  versionBuf.writeUInt32LE(aggrObj.version, 0)
  // bump: u8
  const bumpBuf = Buffer.from([aggrObj.bump])
  
  const data = Buffer.concat([
    discriminator,
    roundBuf,
    proverBuf,
    numSubmissionsBuf,
    sumNEstScaledBuf,
    finalizedBuf,
    finalizedPHatScaledBuf,
    versionBuf,
    bumpBuf
  ])

  ;(program.provider as BankrunProvider).context.setAccount(args.pda, {
    lamports: Number(10n ** 9n),
    owner: program.programId,
    executable: false,
    data,
  })
}