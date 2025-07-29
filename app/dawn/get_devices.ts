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
  console.log({ devices: devices.length })
  console.log(
    devices.map((b) => ({
      owner: b.publicKey.toBase58(),
      account: {
        ...b.account,
        createdAt: new Date(
          b.account.createdAt.toNumber() * 1000,
        ).toISOString(),
        owner: b.account.owner.toBase58(),
        model: b.account.model.toBase58(),
        organization: b.account.organization.toBase58(),
        localDomain: b.account.localDomain.toBase58(),
        macAddress: b.account.macAddress
          .map((n) => n.toString(16).padStart(2, '0'))
          .join(':')
          .toUpperCase(),
      },
    })),
  )
}

main().catch(console.error)
