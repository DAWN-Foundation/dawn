import { connect, getFlag } from './utils'

async function main() {
  const owner = getFlag('--owner')

  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  let filters = []
  if (owner) {
    filters = [
      {
        memcmp: {
          offset: 8,
          bytes: owner,
        },
      },
    ]
  }

  const buildings = await program.account.building.all(filters)

  console.log(
    buildings.map((b) => ({
      owner: b.publicKey.toBase58(),
      account: { ...b.account, owner: b.account.owner.toBase58() },
    })),
  )
}

main().catch(console.error)
