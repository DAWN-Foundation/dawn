import { test, expect, beforeAll } from '@jest/globals'
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { Dawn } from '../../../../target/types/dawn'
import { getIDL } from '../../../shared/cli-utils'
import { getSquadsVaultPda } from '../squads'
import { buildTokenInstructions, buildConfigInstructions, MAINNET_USDC } from '../build_ixs'

let program: Program<Dawn>
const multisigPda = new PublicKey('11111111111111111111111111111112')
const vault = getSquadsVaultPda(multisigPda)

beforeAll(() => {
  // No network calls are made by .instruction(); a dummy provider is sufficient.
  const provider = new AnchorProvider(new Connection('http://127.0.0.1:8899'), new Wallet(Keypair.generate()), {})
  program = new Program(getIDL(), provider)
})

test('token instructions target dawn program with vault as caller', async () => {
  const [initToken, initFee] = await buildTokenInstructions(program, vault)
  expect(initToken.programId.equals(program.programId)).toBe(true)
  // caller is the first account and marked signer
  expect(initToken.keys[0].pubkey.toBase58()).toBe(vault.toBase58())
  expect(initToken.keys[0].isSigner).toBe(true)
  expect(initFee.keys[0].pubkey.toBase58()).toBe(vault.toBase58())
})

test('config instructions use vault authority and USDC stable mint', async () => {
  const [initCfg] = await buildConfigInstructions(program, vault, {
    stableMint: MAINNET_USDC, daoFee: new BN(300), validatorFee: new BN(300), medallionFee: new BN(900),
  })
  const metas = initCfg.keys.map((k) => k.pubkey.toBase58())
  expect(metas).toContain(vault.toBase58())          // caller + apiAuthority
  expect(metas).toContain(MAINNET_USDC.toBase58())    // stable_mint
})
