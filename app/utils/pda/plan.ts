import { BN, Program } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'

import { Dawn } from '../../../target/types/dawn'

export function getServiceAgreementPda(
  program: Program<Dawn>,
  threshold: BN,
  payoutRatio: BN,
): PublicKey {
  const [serviceAgreementPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('service_agreement'),
      Buffer.from(threshold.toArray('le', 8)),
      Buffer.from(payoutRatio.toArray('le', 8)),
    ],
    program.programId,
  )

  return serviceAgreementPda
}

// Helper function to get the PDA for a plan given plan parameters
export function getPlanPda(
  program: Program<Dawn>,
  accessDomain: PublicKey,
  device: PublicKey,
  parentPlan: PublicKey | null,
  name: string,
  price: BN,
  duration: number,
  speed: number,
  capacity: BN,
  startAt: BN | null,
  serviceAgreement: PublicKey,
): [PublicKey, number] {
  const durationBuffer = Buffer.alloc(2) // 2 bytes for a 16-bit integer
  durationBuffer.writeUInt16LE(duration)

  const speedBuffer = Buffer.alloc(4) // 4 bytes for a 32-bit integer
  speedBuffer.writeUInt32LE(speed)

  const parentPlanBuffer = parentPlan
    ? Buffer.from(parentPlan.toBytes())
    : Buffer.from(Array(32).fill(0))

  const [planPda, planBump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('plan'),
      Buffer.from(accessDomain.toBytes()),
      Buffer.from(device.toBytes()),
      parentPlanBuffer,
      Buffer.from(name.slice(0, 32)),
      Buffer.from(price.toArray('le', 8)),
      durationBuffer,
      speedBuffer,
      Buffer.from(capacity.toArray('le', 8)),
      Buffer.from(startAt?.toArray('le', 8) ?? Array(8).fill(0)),
      Buffer.from(serviceAgreement.toBytes()),
    ],
    program.programId,
  )

  return [planPda, planBump]
}
