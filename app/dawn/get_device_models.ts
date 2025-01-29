import { connect } from './utils'

async function main() {
  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const deviceModels = await program.account.deviceModel.all()

  console.log(
    deviceModels.map((a) => ({
      owner: a.publicKey.toBase58(),
      account: a.account,
    })),
  )
}

main().catch(console.error)
