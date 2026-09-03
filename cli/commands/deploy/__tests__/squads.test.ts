import { test, expect } from '@jest/globals'
import { PublicKey } from '@solana/web3.js'
import { getSquadsVaultPda } from '../squads'

// Derived once via the real SDK:
// node -e "const m=require('@sqds/multisig'); const {PublicKey}=require('@solana/web3.js'); \
//   console.log(m.getVaultPda({multisigPda:new PublicKey('11111111111111111111111111111112'), index:0})[0].toBase58())"
const EXPECTED_VAULT = '2oat2epsJ9eYM5yrJLeymELgJKtuWG1QwWMcijBKoeD9'

test('vault PDA matches @sqds/multisig getVaultPda(index 0)', () => {
  const multisigPda = new PublicKey('11111111111111111111111111111112')
  expect(getSquadsVaultPda(multisigPda).toBase58()).toBe(EXPECTED_VAULT)
})
