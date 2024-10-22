import { connect, getFlag } from './utils'

async function main() {
  const plan = getFlag('--plan')
  const subscriber = getFlag('--subscriber')

  const { program } = await connect()
  console.log({ PROGRAM_ID: program.programId.toBase58() })

  let filters = []
  if (plan) {
    filters = [
      {
        memcmp: {
          offset: 8 + 32,
          bytes: plan,
        },
      },
    ]
  } else if (subscriber) {
    filters = [
      {
        memcmp: {
          offset: 8 + 32,
          bytes: subscriber,
        },
      },
    ]
  }

  // const subscriptions = await program.account.subscription.all(filters)

  // console.log(
  //   subscriptions.map((b) => ({
  //     owner: b.publicKey.toBase58(),
  //     account: {
  //       ...b.account,
  //       subscriber: b.account.subscriber.toBase58(),
  //       plan: b.account.plan.toBase58(),
  //       expiration: b.account.expiration.toString(),
  //     },
  //   })),
  // )
}

main().catch(console.error)
