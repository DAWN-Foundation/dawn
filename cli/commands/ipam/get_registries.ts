import { connect, getFlag } from '../../shared/cli-utils'
import { getIpRegistryPda } from '../../../sdk/utils'

async function main() {
  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const data = await program.account.ipRegistry.all()

  console.log(
    data.map((d) => ({
      pda: d.publicKey.toBase58(),
      ...d.account,
    })),
  )
}

main().catch(console.error)
