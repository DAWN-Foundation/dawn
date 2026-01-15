import { PublicKey, Keypair } from '@solana/web3.js'
import { DeviceType, deviceTypeSeed, MacAddress } from '../utils/helpers'
import { Program } from '@coral-xyz/anchor'
import { Dawn } from '../../target/types/dawn'

export function getSubscriptionPda(
  program: Program<Dawn>,
  planPda: PublicKey,
  customer: PublicKey | Keypair,
): [PublicKey, number] {
  const customerPubkey =
    customer instanceof PublicKey ? customer : customer.publicKey

  const [subscriptionPda, subscriptionBump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('subscription'),
      Buffer.from(planPda.toBytes()),
      Buffer.from(customerPubkey.toBytes()),
    ],
    program.programId,
  )

  return [subscriptionPda, subscriptionBump]
}
