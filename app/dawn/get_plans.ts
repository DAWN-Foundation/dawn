import { connect, getFlag } from './utils'

async function main() {
  const localDomain = getFlag('--localDomain')

  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  let filters = []
  if (localDomain) {
    filters = [
      {
        memcmp: {
          offset: 8 + 8 + 32 + 33,
          bytes: localDomain,
        },
      },
    ]
  }

  const plans = await program.account.plan.all(filters)

  console.log(
    plans.map((b) => ({
      owner: b.publicKey.toBase58(),
      account: {
        ...b.account,
        owner: b.account.owner.toBase58(),
        localDomain: b.account.localDomain.toBase58(),
        price: b.account.price.toString(),
        capacity: b.account.capacity.toString(),
        serviceAgreement: b.account.serviceAgreement.toBase58(),
      },
    })),
  )
}

main().catch(console.error)
