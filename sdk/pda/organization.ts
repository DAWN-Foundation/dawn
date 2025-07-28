import { PublicKey } from '@solana/web3.js'
import { Program } from '@coral-xyz/anchor'

import { OrganizationType, organizationTypeSeed } from '../utils/helpers'
import { Dawn } from '../../target/types/dawn'

export function getOrganizationPda(
  program: Program<Dawn>,
  owner: PublicKey,
  organizationType: OrganizationType,
  name: string,
): PublicKey {
  const [organizationPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('organization'),
      owner.toBuffer(),
      organizationTypeSeed(organizationType),
      Buffer.from(name.slice(0, 32)),
    ],
    program.programId,
  )

  return organizationPda
}
