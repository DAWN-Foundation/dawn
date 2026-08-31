import { test, expect } from '@jest/globals'
import * as multisig from '@sqds/multisig'
import { PublicKey } from '@solana/web3.js'
import { getSquadsVaultPda, SQUADS_VAULT_INDEX } from '../squads'

test('vault PDA matches @sqds/multisig getVaultPda(index 0)', () => {
  const multisigPda = new PublicKey('11111111111111111111111111111112')
  const [expected] = multisig.getVaultPda({ multisigPda, index: SQUADS_VAULT_INDEX })
  expect(getSquadsVaultPda(multisigPda).toBase58()).toBe(expected.toBase58())
})
