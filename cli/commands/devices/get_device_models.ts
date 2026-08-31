// @ts-nocheck
import { connect } from '../../shared/cli-utils'

async function main() {
  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const deviceModels = await program.account.deviceModel.all()

  console.log(
    deviceModels.map((a) => ({
      publicKey: a.publicKey.toBase58(),
      account: {
        ...a.account,
        createdAt: new Date(
          a.account.createdAt.toNumber() * 1000,
        ).toISOString(),
        deviceType: Object.keys(a.account.deviceType)[0],
      },
    })),
  )
}

main().catch(console.error)
