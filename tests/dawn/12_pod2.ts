// tests/dawn.submit-min-hash.spec.ts
import * as anchor from '@coral-xyz/anchor'
import { utils as anchorUtils } from '@coral-xyz/anchor'
import { Program, BN } from '@coral-xyz/anchor'
import { assert } from 'chai'
import { Dawn } from '../../target/types/dawn'
import { mock, getProvider, loadWallet } from '../../sdk/utils'
import { BankrunProvider } from 'anchor-bankrun'
import { beforeAll, expect, describe, test } from '@jest/globals'
import { PublicKey, SystemProgram } from '@solana/web3.js'
import crypto from 'crypto'
import * as borsh from '@coral-xyz/borsh'
import { Transaction, TransactionInstruction } from '@solana/web3.js'
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

function combineOrdered(a: Buffer, b: Buffer): Buffer {
  const [lo, hi] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a]
  return sha256([DOMAIN_COMBINE, lo, hi])
}

type MerkleProofJs = { siblings: number[][] }

/* -------------------------- Data Anchor helpers --------------------------- */

// Use the Blober program id you deploy in tests (must match the one compiled for DA)
const DA_PROGRAM_ID = new PublicKey('anchorE4RzhiFx3TEFep6yRNK9igZBzMVWziqjbGHp2')

// We’ll use a simple ASCII namespace (DA program derives the Blober PDA from it)
const DA_NAMESPACE = 'nitro'

// Derive Blober (namespace) PDA: seeds = ["blobs", daPayer, namespace]
function findBloberPda(daPayer: PublicKey, namespace: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('blobs'), daPayer.toBuffer(), Buffer.from(namespace, 'utf8')],
    DA_PROGRAM_ID,
  )[0]
}

// Derive Blob PDA: seeds = ["blobs", payer, blober, timestamp_le, size_le]
function findBlobPda(
  blober: PublicKey,      // namespace PDA
  daPayer: PublicKey,     // must be the same signer you pass as `payer`
  timestamp: bigint | number,   // u64 LE
  size: number,                 // u32 LE
): PublicKey {
  const ts = typeof timestamp === 'number' ? BigInt(timestamp) : timestamp
  const tsLe = Buffer.from(new Uint8Array(new BigUint64Array([BigInt(ts)]).buffer))
  // size is u32, so we need 4 bytes, not 8
  const szLe = Buffer.from(new Uint8Array(new Uint32Array([size]).buffer))
  return PublicKey.findProgramAddressSync(
    [Buffer.from('blobs'), daPayer.toBuffer(), blober.toBuffer(), tsLe, szLe],
    DA_PROGRAM_ID,
  )[0]
}
const initLayout = borsh.struct([ borsh.str('namespace') ])

function ixDisc(name: string) {
  return crypto.createHash('sha256').update(`global:${name}`).digest().slice(0, 8)
}

async function initBloberNamespace(
  provider: BankrunProvider,
  daPayer: anchor.web3.Keypair,
  bloberPda: PublicKey,
  namespace: string,
) {
  const initLayout = borsh.struct([
    borsh.str('namespace'),
    borsh.publicKey('trusted'),
  ])
  
  const buf = Buffer.alloc(1024)
  const span = initLayout.encode({ namespace: DA_NAMESPACE, trusted: daPayer.publicKey }, buf)
  const data = Buffer.concat([ixDisc('initialize'), buf.subarray(0, span)])
  
  const ix = new TransactionInstruction({
    programId: DA_PROGRAM_ID,
    keys: [
      { pubkey: bloberPda,           isSigner: false, isWritable: true  },
      { pubkey: daPayer.publicKey,     isSigner: true,  isWritable: true  },
      { pubkey: SystemProgram.programId,isSigner: false, isWritable: false },
    ],
    data,
  })

  // fund payer (you already do this earlier)
  const tx = new Transaction().add(ix)
  await (provider as any).sendAndConfirm!(tx, [daPayer])
}

/* -------------------------------- test suite ------------------------------- */

export const submitMinHashTests = () =>
  describe('dawn::submit_min_hash', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>

    const wallet = loadWallet()

    // PDAs & accounts
    let roundPda: PublicKey
    let aggregatorPda: PublicKey
    let receiptPda: PublicKey
    let proverPda: PublicKey

    // Data Anchor accounts
    let daPayer: anchor.web3.Keypair
    let daBloberPda: PublicKey
    let daBlobPda: PublicKey
    let daTimestamp: number

    // actors
    let prover: anchor.web3.Keypair
    let challenger: anchor.web3.Keypair

    // fixed test params
    const roundId = 42n
    const n = 10
    const packetRoot = Buffer.alloc(32, 7)
    let minToken: Buffer

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

      prover = anchor.web3.Keypair.generate()
      challenger = anchor.web3.Keypair.generate()
      daPayer = anchor.web3.Keypair.generate()

      // fund prover, challenger, daPayer
      for (const kp of [prover, challenger, daPayer]) {
        provider.context.setAccount(kp.publicKey, {
          lamports: 10e9,
          owner: SystemProgram.programId,
          executable: false,
          data: Buffer.alloc(0),
        })
      }

      // init prover on-chain
      proverPda = PublicKey.findProgramAddressSync(
        [Buffer.from('prover'), prover.publicKey.toBuffer()],
        program.programId,
      )[0]
      await program.methods
        .registerProver()
        .accountsPartial({
          prover: proverPda,
          authority: prover.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([prover])
        .rpc()

      // build leaf + proof and compute root
      leaf = {
        challenger: challenger.publicKey,
        prover: proverPda,
        roundId,
        packetRoot,
        n,
      }
      const leafH = leafHash(leaf)
      dataAnchorRoot = combineOrdered(combineOrdered(leafH, sib1), sib2)
      proof = { siblings: [sib1, sib2].map((b) => Array.from(b)) }

      // round seed & PDAs (use your program’s seeds)
      const seed = crypto.randomBytes(32)
      roundPda = PublicKey.findProgramAddressSync(
        [Buffer.from('round'), Buffer.from(seed)],
        program.programId,
      )[0]

      aggregatorPda = PublicKey.findProgramAddressSync(
        [Buffer.from('aggregator'), roundPda.toBuffer(), proverPda.toBuffer()],
        program.programId,
      )[0]

      // init round on-chain
      await program.methods
        .initChallengeRound(
          Array.from(seed),
          n,
          1,
          new BN(0),
          new BN(1000),
          Array.from(dataAnchorRoot),
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          round: roundPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([mock.serviceProvider])
        .rpc()

      // ----------------- Data Anchor namespace + blob -----------------
      // 1) derive Blober (namespace) PDA; you must have initialized it off-chain in real flow
      daBloberPda = findBloberPda(daPayer.publicKey, DA_NAMESPACE)

      // In bankrun tests, we “pretend” the blober account exists by creating an owned account
      // with the DA program as owner. If your validator actually runs DA, you can skip this.
      // provider.context.setAccount(daBloberPda, {
      //   lamports: 1e9,
      //   owner: DA_PROGRAM_ID,
      //   executable: false,
      //   data: Buffer.alloc(64), // minimal placeholder; real program will overwrite
      // })

      // 2) choose minToken + daTimestamp and derive Blob PDA (payload size is known)
      minToken = crypto.randomBytes(32)
      const payloadLen = 1 + 32 + 32 + 32 // version + round_id + prover + min_token
      daTimestamp = 1_717_981_200 // fixed for determinism in tests
      daBlobPda = findBlobPda(daBloberPda, daPayer.publicKey, daTimestamp, payloadLen)

      // Pre-create the blob account (owned by DA program) so CPI can write into it in bankrun
      // provider.context.setAccount(daBlobPda, {
      //   lamports: 1e9,
      //   owner: DA_PROGRAM_ID,
      //   executable: false,
      //   data: Buffer.alloc(0),
      // })
    })

    test('mock setup', () => {
      assert.exists(mock)
    })

    test('submit_min_hash succeeds with valid DA proof', async () => {
      await initBloberNamespace(provider, daPayer, daBloberPda, DA_NAMESPACE)

      const sig = await program.methods
        .submitMinHash(
          {
            challenger: leaf.challenger,
            prover: leaf.prover,
            roundId: new BN(leaf.roundId.toString()),
            packetRoot: Array.from(leaf.packetRoot),
            n: leaf.n,
          },
          proof,
          Array.from(minToken),
          new BN(daTimestamp),
        )
        .accountsPartial({
          // your program’s accounts
          proverAuthority: prover.publicKey,
          prover: proverPda,
          round: roundPda,
          aggregator: aggregatorPda,

          // Data Anchor CPI accounts
          daBlober: daBloberPda,
          daBlob: daBlobPda,
          daPayer: daPayer.publicKey,
          daProgram: DA_PROGRAM_ID,

          systemProgram: SystemProgram.programId,
        })
        .signers([prover, daPayer])
        .rpc()

      expect(sig).toBeTruthy()

      // check aggregator updated
      const aggr = await program.account.aggregator.fetch(aggregatorPda)
      expect(aggr.numSubmissions.toString()).toBe('1')
      expect(new BN(aggr.sumNEstScaled).gte(new BN(0))).toBeTruthy()
    })

    test.skip('wrong prover is rejected', async () => {
      const other = anchor.web3.Keypair.generate()
      provider.context.setAccount(other.publicKey, {
        lamports: 5e9,
        owner: SystemProgram.programId,
        executable: false,
        data: Buffer.alloc(0),
      })

      const minToken2 = crypto.randomBytes(32)
      const otherPda = PublicKey.findProgramAddressSync(
        [Buffer.from('prover'), other.publicKey.toBuffer()],
        program.programId,
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
            Array.from(minToken2),
            new BN(daTimestamp),
          )
          .accountsPartial({
            prover: otherPda, // signer != leaf.prover
            proverAuthority: other.publicKey,
            round: roundPda,
            aggregator: aggregatorPda,

            daBlober: daBloberPda,
            daBlob: findBlobPda(daBloberPda, daPayer.publicKey, daTimestamp, 1 + 8 + 32 + 32),
            daPayer: daPayer.publicKey,
            daProgram: DA_PROGRAM_ID,

            systemProgram: SystemProgram.programId,
          })
          .signers([other, daPayer])
          .rpc()
        expect(false).toBe(true)
      } catch (e: any) {
        expect(String(e.message || e)).toMatch(/WrongProver|prover/i)
      }
    })

    test.skip('invalid DA proof is rejected', async () => {
      const badSib = Buffer.alloc(32, 9)
      const badProof: MerkleProofJs = { siblings: [Array.from(badSib)] }
      const minToken3 = crypto.randomBytes(32)

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
            Array.from(minToken3),
            new BN(daTimestamp),
          )
          .accountsPartial({
            prover: proverPda,
            proverAuthority: prover.publicKey,
            round: roundPda,
            aggregator: aggregatorPda,

            daBlober: daBloberPda,
            daBlob: findBlobPda(daBloberPda, daPayer.publicKey, daTimestamp, 1 + 8 + 32 + 32),
            daPayer: daPayer.publicKey,
            daProgram: DA_PROGRAM_ID,

            systemProgram: SystemProgram.programId,
          })
          .signers([prover, daPayer])
          .rpc()
        expect(false).toBe(true)
      } catch (e: any) {
        expect(String(e.message || e)).toMatch(/InvalidDAInclusion|invalid/i)
      }
    })

    test('finalize_aggregator succeeds', async () => {
      const sig = await program.methods
        .finalizeAggregator(Array.from(minToken))
        .accountsPartial({
          proverAuthority: prover.publicKey,
          round: roundPda,
          aggregator: aggregatorPda,
          prover: proverPda,
        })
        .signers([prover])
        .rpc()

      expect(sig).toBeTruthy()

      const aggr = await program.account.aggregator.fetch(aggregatorPda)
      expect(aggr.finalized).toBeTruthy()
    })
  })