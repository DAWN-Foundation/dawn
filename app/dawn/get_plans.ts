import { connect, getFlag } from './utils'

async function main() {
  const building = getFlag('--building')

  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  let filters = []
  if (building) {
    filters = [
      {
        memcmp: {
          offset: 8 + 32,
          bytes: building,
        },
      },
    ]
  }

  const plans = await program.account.plan.all(filters)

  console.log(
    plans.map((b) => ({
      owner: b.publicKey.toBase58(),
      account: {
        ...b.account,
        owner: b.account.owner.toBase58(),
        building: b.account.building.toBase58(),
        price: b.account.price.toString(),
        capacity: b.account.capacity.toString(),
        slaId: b.account.slaId.toString(),
      },
    })),
  )
}

main().catch(console.error)
