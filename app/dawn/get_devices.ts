import { connect, getFlag } from './utils'

async function main() {
  const owner = getFlag('--owner')

  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const filters = []
  if (owner) {
    filters.concat([
      {
        memcmp: {
          offset: 8,
          bytes: owner,
        },
      },
    ])
  }

  const devices = await program.account.device.all(filters)

  console.log(
    devices.map((b) => ({
      owner: b.publicKey.toBase58(),
      account: { ...b.account, owner: b.account.owner.toBase58() },
    })),
  )
}

main().catch(console.error)
