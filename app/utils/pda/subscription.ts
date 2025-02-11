import { PublicKey, Keypair } from '@solana/web3.js'
import { DeviceType, deviceTypeSeed, MacAddress } from '../helpers'
import { Program } from '@coral-xyz/anchor'
import { Dawn } from '../../../target/types/dawn'

export function getSubscriptionPda(
  program: Program<Dawn>,
  planPda: PublicKey,
  customer: Keypair,
): [PublicKey, number] {
  const [subscriptionPda, subscriptionBump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('subscription'),
      Buffer.from(planPda.toBytes()),
      Buffer.from(customer.publicKey.toBytes()),
    ],
    program.programId,
  )

  return [subscriptionPda, subscriptionBump]
}
