// @ts-nocheck
import { connect, getFlag } from '../../shared/cli-utils'
import { getRootIpBlockPda } from '../../../sdk/utils'

async function main() {
  const { program } = await connect()
  const data = await program.account.rootIpBlock.all()

  console.log(
    data.map((d) => ({
      pda: d.publicKey.toBase58(),
      ...d.account,
    })),
  )
}

main().catch(console.error)
