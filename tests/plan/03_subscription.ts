import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError } from '@coral-xyz/anchor'
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { assert } from 'chai'
import { Keypair, PublicKey, SendTransactionError } from '@solana/web3.js'

import { Plan } from '../../target/types/plan'
import { getEvent, mock } from './utils'
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes'
import { BUILDING_SIZE } from './01_building'

// Helper function to get the PDA for a plan given plan parameters
function getPlanPda(
  program: Program<Plan>,
  building: PublicKey,
  price: BN,
  duration: number,
  speed: number,
  capacity: BN,
  slaId: BN,
): [PublicKey, number] {
  const durationBuffer = Buffer.alloc(2) // 2 bytes for a 16-bit integer
  durationBuffer.writeUInt16LE(duration)

  const speedBuffer = Buffer.alloc(4) // 4 bytes for a 32-bit integer
  speedBuffer.writeUInt32LE(speed)

  const [planPda, planBump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('plan'),
      Buffer.from(building.toBytes()),
      Buffer.from(price.toArray('le', 8)),
      durationBuffer,
      speedBuffer,
      Buffer.from(capacity.toArray('le', 8)),
      Buffer.from(slaId.toArray('le', 8)),
    ],
    program.programId,
  )

  return [planPda, planBump]
}

async function getPlansForBuilding(
  program: Program<Plan>, // Anchor program
  building: PublicKey, // Public key of the building
): Promise<any[]> {
  // Define the byte offset for the `building` field in the Plan account (8 bytes for discriminator + 32 bytes for owner)
  const BUILDING_OFFSET = 8 + 32

  // Fetch all plan accounts and filter by building key
  const plans = await program.provider.connection.getProgramAccounts(
    program.programId,
    {
      // Filtering accounts by the `building` public key stored in the Plan account
      filters: [
        {
          memcmp: {
            offset: BUILDING_OFFSET, // Offset where the building public key is stored
            bytes: building.toBase58(), // The building public key to filter by
          },
        },
      ],
    },
  )

  // Decode and return the accounts
  return plans.map((accountInfo) => {
    return program.account.plan.coder.accounts.decode(
      'plan',
      accountInfo.account.data,
    )
  })
}

describe('plan::subscription', () => {
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.Plan as Program<Plan>
  const wallet = provider.wallet as NodeWallet

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    program.programId,
  )

  let planPda: PublicKey
  let plan: Awaited<ReturnType<typeof program.account.plan.fetch>>

  before(async () => {
    const plans = await program.account.plan.all()
    assert.ok(plans.length > 0)
    plan = plans[0].account
    planPda = plans[0].publicKey
  })

  it('mock setup', () => {
    assert.exists(mock)
    assert.exists(plan)
    assert.ok(plan.owner.equals(mock.buildingOwner.publicKey))
    assert.exists(planPda)
  })

  it('subscribes to the plan', async () => {
    const tx = await program.methods
      .subscribe()
      .accounts({
        caller: mock.tester.publicKey,
        config: configPda,
        plan: planPda,
        andrenaUsdcAccount: mock.andrenaUsdcAccount,
        dawnUsdcAccount: mock.dawnUsdcAccount,
        userUsdcAccount: mock.testerUsdcAccount,
        boUsdcAccount: mock.boUsdcAccount,
      })
      .signers([mock.tester])
      .rpc()

    assert.ok(tx.length > 0)
  })
})
