import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js'
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor'
import { Dawn } from '../../../target/types/dawn'
import { getAuthMethodPda } from '../../../sdk/pda/amf'
import { getPlanPda } from '../../../sdk/pda/plan'

export async function addAuthMethod(
  program: Program<Dawn>,
  provider: AnchorProvider,
  planOwner: PublicKey,
  planName: string,
  planPrice: BN,
  planDuration: number,
  planSpeed: number,
  planCapacity: BN,
  planStartAt: BN,
  serviceAgreement: PublicKey,
  localDomain: PublicKey,
  parentPlan: PublicKey | null,
  authMethodAuthority: PublicKey,
  authMethodType: any,
  authMethodParameters: Buffer,
) {
  const [planPda] = getPlanPda(
    program,
    localDomain,
    parentPlan,
    planName,
    planPrice,
    planDuration,
    planSpeed,
    planCapacity,
    planStartAt,
    serviceAgreement,
  )

  const authMethodPda = getAuthMethodPda(
    program,
    authMethodAuthority,
    authMethodType,
    authMethodParameters,
  )

  const ix = await program.methods
    .addAuthMethod()
    .accounts({
      caller: planOwner,
      plan: planPda,
      authMethod: authMethodPda,
    })
    .instruction()

  return ix
}
