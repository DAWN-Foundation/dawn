import { connect } from '../../shared/cli-utils'

async function main() {
  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const deviceModels = await program.account.deviceLocation.all()

  console.log(
    deviceModels.map((a) => ({
      pubkey: a.publicKey.toBase58(),
      account: {
        ...a.account,
        latitude: a.account.latitude.toString(),
        longitude: a.account.longitude.toString(),
        verifiedAt:
          a.account.verifiedAt?.toNumber() > 0
            ? new Date(a.account.verifiedAt.toNumber() * 1000).toISOString()
            : '0',
        device: a.account.device.toBase58(),
        createdAt: new Date(
          a.account.createdAt.toNumber() * 1000,
        ).toISOString(),
      },
    })),
  )
}

main().catch(console.error)
