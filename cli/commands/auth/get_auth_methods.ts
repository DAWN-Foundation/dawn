// @ts-nocheck
import { connect } from '../../shared/cli-utils'

async function main() {
  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  const authMethods = await program.account.authMethod.all()
  console.log(`auth methods found: ${authMethods.length}`)

  console.log(
    authMethods.map((a) => ({
      publicKey: a.publicKey.toBase58(),
      account: {
        ...a.account,
        createdAt: new Date(
          a.account.createdAt.toNumber() * 1000,
        ).toISOString(),
        methodType: Object.keys(a.account.methodType)[0],
        authority: a.account.authority.toBase58(),
        device: a.account.device.toBase58(),
        parameters: '[' + Array.from(a.account.parameters).join(',') + ']',
      },
    })),
  )
}

main().catch(console.error)
