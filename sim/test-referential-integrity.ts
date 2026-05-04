/**
 * Fault-injection test for the `referential-integrity` invariant.
 *
 * This is the offensive companion to the appliesTo-gated trace evidence.
 * It builds minimal WorldState-shaped stubs in memory (no bankrun, no
 * scenario), wires up known-bad references, and asserts the invariant
 * `check()` fails with the expected offenders.
 *
 * The intent: prove the invariant has teeth. A passing reference-integrity
 * pass on a real scenario only tells us "no offenders found" — it could
 * mean clean state OR a broken check. This file rules out the second.
 */

import { Keypair, PublicKey } from '@solana/web3.js'

import { GLOBAL_INVARIANTS } from './invariants'
import { AccountSnapshot, WorldState } from './world-state'

const inv = GLOBAL_INVARIANTS.find((i) => i.name === 'referential-integrity')
if (!inv) throw new Error('referential-integrity invariant not registered')

// Stub a WorldState by hand. Only the methods the invariant uses are needed:
// allAccounts() and byPubkey(). We cast through `unknown` since the rest of
// the surface is irrelevant for this test.
function makeWorld(snaps: AccountSnapshot[]): WorldState {
  const byPk = new Map(snaps.map((s) => [s.pubkey, s]))
  return {
    allAccounts: () => snaps,
    byPubkey: (pk: PublicKey | string) => {
      const k = typeof pk === 'string' ? pk : pk.toBase58()
      return byPk.get(k) ?? null
    },
  } as unknown as WorldState
}

function dawn(type: string, decoded: Record<string, unknown>): AccountSnapshot {
  return {
    pubkey: Keypair.generate().publicKey.toBase58(),
    kind: 'dawn',
    type,
    decoded,
    rawLen: 0,
    owner: 'dawn',
    lamports: 0,
  }
}

function spl(kind: 'spl-mint' | 'spl-token-account'): AccountSnapshot {
  return {
    pubkey: Keypair.generate().publicKey.toBase58(),
    kind,
    type: kind === 'spl-mint' ? 'SplMint' : 'SplTokenAccount',
    decoded: {},
    rawLen: kind === 'spl-mint' ? 82 : 165,
    owner: 'TokenProgram',
    lamports: 0,
  }
}

let pass = 0
let fail = 0

function expect(name: string, ok: boolean, predicate: (msg: string) => boolean = () => true): void {
  // We only know the result type after running, so callers pass `ok` for the
  // *expected* outcome. For failing checks, `predicate` lets us assert on the
  // message text.
  const result = inv!.check(world)
  const matched =
    (ok && result.ok) ||
    (!ok && !result.ok && predicate(result.message))
  if (matched) {
    console.log(`[PASS] ${name}`)
    pass += 1
  } else {
    console.error(`[FAIL] ${name}`)
    console.error(`         result: ${JSON.stringify(result)}`)
    fail += 1
  }
}

// We mutate `world` between cases.
let world: WorldState

// Case 1: clean state — Plan → LocalDomain, both extant. Should pass.
{
  const localDomain = dawn('LocalDomain', { owner: Keypair.generate().publicKey })
  const plan = dawn('Plan', {
    owner: Keypair.generate().publicKey,
    accessDomain: null,
    distributionDomain: null,
    localDomain: new PublicKey(localDomain.pubkey),
    parentPlan: null,
    serviceAgreement: Keypair.generate().publicKey, // dangling — see below
    authMethods: [],
  })
  // Provide the ServiceAgreement so this case is fully clean.
  const sa = dawn('ServiceAgreement', {})
  ;(plan.decoded as any).serviceAgreement = new PublicKey(sa.pubkey)
  world = makeWorld([localDomain, plan, sa])
  expect('clean Plan → LocalDomain + ServiceAgreement passes', true)
}

// Case 2: dangling Plan.localDomain (target pubkey absent from world).
{
  const danglingPk = Keypair.generate().publicKey
  const sa = dawn('ServiceAgreement', {})
  const plan = dawn('Plan', {
    owner: Keypair.generate().publicKey,
    accessDomain: null,
    distributionDomain: null,
    localDomain: danglingPk,
    parentPlan: null,
    serviceAgreement: new PublicKey(sa.pubkey),
    authMethods: [],
  })
  world = makeWorld([plan, sa])
  expect(
    'dangling Plan.localDomain caught',
    false,
    (msg) => msg.includes('localDomain') && msg.includes('does not exist'),
  )
}

// Case 3: wrong-type target — Plan.localDomain points at a Device.
{
  const device = dawn('Device', {
    owner: Keypair.generate().publicKey,
    model: Keypair.generate().publicKey,
    localDomain: Keypair.generate().publicKey,
  })
  const sa = dawn('ServiceAgreement', {})
  const plan = dawn('Plan', {
    owner: Keypair.generate().publicKey,
    accessDomain: null,
    distributionDomain: null,
    localDomain: new PublicKey(device.pubkey), // wrong type
    parentPlan: null,
    serviceAgreement: new PublicKey(sa.pubkey),
    authMethods: [],
  })
  // Device.localDomain dangles too — give it a real one to isolate the bug.
  const ld = dawn('LocalDomain', { owner: Keypair.generate().publicKey })
  ;(device.decoded as any).localDomain = new PublicKey(ld.pubkey)
  // Device.model also dangles — give it a DeviceModel.
  const dm = dawn('DeviceModel', {})
  ;(device.decoded as any).model = new PublicKey(dm.pubkey)
  world = makeWorld([device, plan, sa, ld, dm])
  expect(
    'wrong-type Plan.localDomain → Device caught',
    false,
    (msg) => msg.includes('expected LocalDomain') && msg.includes('got Device'),
  )
}

// Case 4: required field is null. Plan.localDomain is NOT optional.
{
  const sa = dawn('ServiceAgreement', {})
  const plan = dawn('Plan', {
    owner: Keypair.generate().publicKey,
    accessDomain: null,
    distributionDomain: null,
    localDomain: null,
    parentPlan: null,
    serviceAgreement: new PublicKey(sa.pubkey),
    authMethods: [],
  })
  world = makeWorld([plan, sa])
  expect(
    'null required field caught',
    false,
    (msg) => msg.includes('localDomain') && msg.includes('null but field is required'),
  )
}

// Case 5: optional null is OK. Plan.parentPlan is optional.
{
  const ld = dawn('LocalDomain', { owner: Keypair.generate().publicKey })
  const sa = dawn('ServiceAgreement', {})
  const plan = dawn('Plan', {
    owner: Keypair.generate().publicKey,
    accessDomain: null,
    distributionDomain: null,
    localDomain: new PublicKey(ld.pubkey),
    parentPlan: null, // optional
    serviceAgreement: new PublicKey(sa.pubkey),
    authMethods: [],
  })
  world = makeWorld([ld, plan, sa])
  expect('optional null parentPlan passes', true)
}

// Case 6: IpLease.seedKey polymorphism — Subscriber tier expects Subscription.
{
  // Loopback tier: seedKey points at a Device. Should pass.
  const device = dawn('Device', {
    owner: Keypair.generate().publicKey,
    model: Keypair.generate().publicKey,
    localDomain: Keypair.generate().publicKey,
  })
  const ld = dawn('LocalDomain', { owner: Keypair.generate().publicKey })
  ;(device.decoded as any).localDomain = new PublicKey(ld.pubkey)
  const dm = dawn('DeviceModel', {})
  ;(device.decoded as any).model = new PublicKey(dm.pubkey)
  const lease = dawn('IpLease', {
    tier: 'Loopback',
    seedKey: new PublicKey(device.pubkey), // Device — correct for Loopback
    device: null,
  })
  world = makeWorld([device, ld, dm, lease])
  expect('Loopback IpLease.seedKey → Device passes', true)
}

// Case 7: Subscriber tier with seedKey → Device (should be Subscription).
{
  const device = dawn('Device', {
    owner: Keypair.generate().publicKey,
    model: Keypair.generate().publicKey,
    localDomain: Keypair.generate().publicKey,
  })
  const ld = dawn('LocalDomain', { owner: Keypair.generate().publicKey })
  ;(device.decoded as any).localDomain = new PublicKey(ld.pubkey)
  const dm = dawn('DeviceModel', {})
  ;(device.decoded as any).model = new PublicKey(dm.pubkey)
  const lease = dawn('IpLease', {
    tier: 'Subscriber',
    seedKey: new PublicKey(device.pubkey), // wrong — should be Subscription
    device: null,
  })
  world = makeWorld([device, ld, dm, lease])
  expect(
    'Subscriber IpLease.seedKey → Device caught (expects Subscription)',
    false,
    (msg) => msg.includes('seedKey') && msg.includes('expected Subscription'),
  )
}

// Case 8: Mint check — Config.dawnMint pointing at a TokenAccount fails.
{
  const tokenAcct = spl('spl-token-account')
  const realMint = spl('spl-mint')
  const config = dawn('Config', {
    authority: Keypair.generate().publicKey,
    apiAuthority: Keypair.generate().publicKey,
    tokenConfig: Keypair.generate().publicKey,
    stableMint: new PublicKey(realMint.pubkey),
    dawnMint: new PublicKey(tokenAcct.pubkey), // wrong kind
    feePoolDawnAccount: new PublicKey(tokenAcct.pubkey),
    daoDawnAccount: new PublicKey(tokenAcct.pubkey),
    validatorDawnAccount: new PublicKey(tokenAcct.pubkey),
    medallionDawnAccount: new PublicKey(tokenAcct.pubkey),
    raydium: Keypair.generate().publicKey,
    raydiumAuthority: Keypair.generate().publicKey,
    raydiumConfig: Keypair.generate().publicKey,
    raydiumPool: Keypair.generate().publicKey,
    raydiumObservation: Keypair.generate().publicKey,
  })
  // Need TokenConfig to satisfy the dawn → dawn check on Config.tokenConfig.
  const tc = dawn('TokenConfig', { dawnMint: new PublicKey(realMint.pubkey) })
  ;(config.decoded as any).tokenConfig = new PublicKey(tc.pubkey)
  world = makeWorld([config, tokenAcct, realMint, tc])
  expect(
    'Config.dawnMint pointing at TokenAccount caught',
    false,
    (msg) => msg.includes('dawnMint') && msg.includes('expected Mint'),
  )
}

// ---------------------------------------------------------------------------
console.log(`--- referential-integrity fault tests: ${pass} pass, ${fail} fail ---`)
process.exit(fail === 0 ? 0 : 1)
