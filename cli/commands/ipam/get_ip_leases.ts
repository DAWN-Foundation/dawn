// @ts-nocheck
import { connect } from '../../shared/cli-utils'

async function main() {
  const { program } = await connect()
  const data = await program.account.ipLease.all()

  console.log(
    data.map((d) => ({
      pda: d.publicKey.toBase58(),
      ...d.account,
    })),
  )
}

main().catch(console.error)
