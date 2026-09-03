# Minimal Deploy + Squads-Governed Config — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the DAWN program to deploy + mint-DAWN + set-authority only, and restructure the deploy/config flow so a hot wallet deploys and a Squads v4 multisig performs all privileged config via create-only proposals.

**Architecture:** Comment out the 24 non-kept `#[program]` entries (leaving domain code compiled). Add a feature-gated mainnet `declare_id!`. New TypeScript tooling under `cli/commands/deploy/` uses `@sqds/multisig` to build two create-only proposals whose inner instructions (`init_token`+`init_fee_accounts`, then `initialize_config`+`init_metadata`) run as the multisig **vault PDA**, making the vault `config.authority`. A markdown runbook documents the external-party flow.

**Tech Stack:** Anchor 0.32.1, Rust 1.87.0, Agave/Solana CLI 3.1.14, `@coral-xyz/anchor` 0.32.1, `@solana/web3.js` 1.98.4, `@solana/spl-token` 0.4.15, `@sqds/multisig`, TypeScript 5, jest/ts-jest.

**Spec:** `docs/superpowers/specs/2026-08-31-minimal-deploy-squads-design.md`

## Global Constraints

- Keep set (only these 5 `#[program]` instructions stay active): `init_token`, `init_fee_accounts`, `initialize_config`, `init_metadata`, `update_config`.
- Disabled instructions are **commented out, never deleted**; domain source files under `programs/dawn/src/app/` stay in place.
- Mainnet program ID: `dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP` (feature-gated `declare_id!`; the private keypair is never committed).
- Squads v4 program ID: `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`. Vault index: `0`.
- All privileged instructions in proposals run with `caller = vault PDA`. `config.authority` and `config.api_authority` = vault PDA.
- `config.stable_mint` = mainnet USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (devnet dry-run uses a valid devnet mint). The five Raydium accounts = `SystemProgram.programId` placeholder (they are `UncheckedAccount`, stored not validated).
- DAWN is minted only by `init_token` (fixed 1B, `MINT_AMOUNT`), to the vault's DAWN ATA which `init_token` creates.
- Scripts **create** proposals only; approval + execution happen in the Squads UI.
- Existing PDA helpers to reuse (from `sdk/pda/config.ts`): `getTokenConfigPda` (`[b"token"]`), `getConfigPda` (`[b"config"]`), `getFeePoolDawnAccountPda`, `getDaoDawnAccountPda`, `getValidatorDawnAccountPda`, `getMedallionDawnAccountPda`. DAWN mint PDA = `findProgramAddressSync([Buffer.from('dawn')], programId)`.

---

## File Structure

- `programs/dawn/src/lib.rs` — mainnet `declare_id!`; comment out 24 `#[program]` entries.
- `programs/dawn/Cargo.toml` — add `mainnet = []` feature.
- `Anchor.toml` — add `[programs.mainnet] dawn = "dawnC74…"`.
- `sdk/utils/helpers.ts` — `getProgramId()` supports `--mainnet`.
- `cli/shared/cli-utils.ts` — `connect()` supports `--mainnet` RPC + program id.
- `tests/dawn/dawn.test.ts` — run only the KEEP-set describe(s).
- `package.json` — add `@sqds/multisig`; comment out dead `dawn:*` scripts; add `dawn:deploy:*` scripts.
- `cli/commands/deploy/squads.ts` — Squads helper (vault PDA, next index, create+propose).
- `cli/commands/deploy/build_ixs.ts` — dawn instruction builders for the vault.
- `cli/commands/deploy/create_token_proposal.ts` — Proposal A entrypoint.
- `cli/commands/deploy/create_config_proposal.ts` — Proposal B entrypoint.
- `cli/commands/deploy/__tests__/build_ixs.test.ts`, `squads.test.ts` — unit tests.
- `docs/mainnet-deployment.md` — external-party runbook.

---

## Task 1: Mainnet program ID (feature-gated)

**Files:**
- Modify: `programs/dawn/src/lib.rs:6-10`
- Modify: `programs/dawn/Cargo.toml` (`[features]`)
- Modify: `Anchor.toml` (`[programs]`)

**Interfaces:**
- Produces: a `mainnet` cargo feature; program builds at `dawnC74…` under `--features mainnet`.

- [ ] **Step 1: Add the `mainnet` feature.** In `programs/dawn/Cargo.toml`, under `[features]`, add:

```toml
mainnet = []
```

- [ ] **Step 2: Replace the declare_id block** in `programs/dawn/src/lib.rs` (currently lines 6-10) with three mutually-exclusive guards:

```rust
#[cfg(feature = "mainnet")]
declare_id!("dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP");

#[cfg(all(feature = "devnet", not(feature = "mainnet")))]
declare_id!("dawnt36j2ej84PXrEjrxDjmQb5nAAqCVwTP8f1Y1aYu");

#[cfg(all(not(feature = "devnet"), not(feature = "mainnet")))]
declare_id!("4yBWXvJ2otyMvkBewgKhnkJ7WP1c7HHDSicdQwH4dXqC");
```

- [ ] **Step 3: Add the mainnet program to `Anchor.toml`.** After the `[programs.devnet]` block add:

```toml
[programs.mainnet]
dawn = "dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP"
```

- [ ] **Step 4: Verify localnet build still compiles.**

Run: `anchor build`
Expected: builds; `target/idl/dawn.json` `"address"` = `4yBWXvJ2otyMvkBewgKhnkJ7WP1c7HHDSicdQwH4dXqC`.

- [ ] **Step 5: Verify mainnet feature build sets the id.**

Run: `anchor build -- --features mainnet && node -e "console.log(require('./target/idl/dawn.json').address)"`
Expected: prints `dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP`.

- [ ] **Step 6: Rebuild localnet id for the rest of the work.**

Run: `anchor build`

- [ ] **Step 7: Commit.**

```bash
git add programs/dawn/src/lib.rs programs/dawn/Cargo.toml Anchor.toml
git commit -m "feat: add feature-gated mainnet program id"
```

---

## Task 2: Disable non-kept instructions

**Files:**
- Modify: `programs/dawn/src/lib.rs` (the `#[program] pub mod dawn` block, lines ~24-279)

**Interfaces:**
- Produces: an IDL exposing exactly the 5 KEEP-set instructions.

- [ ] **Step 1: Comment out the 24 non-kept `pub fn` wrappers** inside `#[program] pub mod dawn`. Keep only `init_token`, `init_fee_accounts`, `initialize_config`, `init_metadata`, `update_config`. Comment out (wrap each entire `pub fn … { … }` in `/* … */` or line-comment each): `register_auth_method`, `add_auth_method`, `register_credential`, `register_credential_for`, `revoke_credential`, `register_connection`, `revoke_connection`, `add_device_model`, `add_device`, `add_device_for`, `verify_device_location`, `add_service_agreement`, `add_l3_plan`, `add_l2_plan`, `subscribe`, `subscribe_for`, `extend_subscription`, `extend_subscription_for`, `claim`, `initialize_root_ip_block`, `allocate_ip`, `lease_subscription_ip`, `lease_subscription_ip_for`, `revoke_ip`. Add a one-line comment banner: `// --- DISABLED: re-enable by uncommenting (see DAWN-minimal-deploy-squads) ---`.

- [ ] **Step 2: Build.**

Run: `anchor build 2>&1 | tail -20`
Expected: `Finished` with **no warnings**, no errors. (Domain modules stay compiled as unused `pub` items — a lib crate emits no dead_code warnings.)

- [ ] **Step 3: Assert the IDL contains exactly the 5 kept instructions.**

Run: `node -e "const n=require('./target/idl/dawn.json').instructions.map(i=>i.name).sort(); console.log(n.length, n.join(','))"`
Expected: `5 initFeeAccounts,initMetadata,initToken,initializeConfig,updateConfig` (order may vary; count is 5 and the set matches).

- [ ] **Step 4: Commit.**

```bash
git add programs/dawn/src/lib.rs
git commit -m "feat: disable all instructions except deploy/token/config (commented, not removed)"
```

---

## Task 3: Trim the accumulative test suite to the KEEP set

**Files:**
- Modify: `tests/dawn/dawn.test.ts`

**Interfaces:**
- Consumes: the trimmed program from Task 2.
- Produces: a green `yarn test` covering only config/token behavior.

- [ ] **Step 1: Reduce `tests/dawn/dawn.test.ts` to the config suite.** Comment out every describe-invocation except `configTests()` (the device/plan/subscription/ipam/amf/claim suites call now-removed instructions). Keep the imports commented alongside, and keep a banner: `// DISABLED with the instructions they exercise — see DAWN-minimal-deploy-squads`. Result:

```ts
import { configTests } from './00_config'
// Disabled suites (their instructions are commented out in lib.rs):
// import { deviceModelTests } from './01_device_model' … (etc.)

configTests()
```

- [ ] **Step 2: Inspect `00_config.ts` for calls to disabled instructions.** Run: `grep -nE "\\.add(Device|L2Plan|L3Plan|ServiceAgreement)|\\.subscribe|\\.claim|\\.registerAuthMethod|\\.registerCredential|initializeRootIpBlock|allocateIp|leaseSubscriptionIp|revokeIp|\\.registerConnection" tests/dawn/00_config.ts` — expected: no matches (config suite only touches init/config/metadata). If any match appears, comment out that individual `test(...)` block with the same banner.

- [ ] **Step 3: Build the program so the fixture is current.**

Run: `anchor build`

- [ ] **Step 4: Run the trimmed suite.**

Run: `yarn test 2>&1 | grep -E "Tests:|Test Suites:|✕"`
Expected: `Test Suites: 1 passed`, `Tests:` shows only passing config tests, zero `✕`.

- [ ] **Step 5: Commit.**

```bash
git add tests/dawn/dawn.test.ts
git commit -m "test: trim accumulative suite to the enabled config/token set"
```

---

## Task 4: Remove dead CLI surface for disabled features

**Files:**
- Modify: `package.json` (`scripts`)

**Interfaces:**
- Produces: `package.json` scripts exposing only kept + deploy commands.

- [ ] **Step 1: Comment intent + remove dead scripts.** In `package.json` `scripts`, delete the `dawn:*` entries for disabled features (devices: `add_device`, `add_devices`, `add_batch`, `add_device_model`, `get_device_models`, `get_devices`, `get_device_locations`; auth: `get_auth_methods`, `register_auth_method`, `register_credential`, `revoke_credential`; plans: `add_plan`, `get_plans`, `add_service_agreement`, `get_service_agreements`; subscriptions: `subscribe`, `get_subscriptions`, `claim`; ipam: `get_registries`, `init_root_ip_block`, `init_ipam`, `get_root_ip_blocks`, `get_ip_blocks`, `get_ip_leases`, `allocate_ip`, `lease_subscription_ip`). Keep: `test`, `lint*`, `clean`, `prebuild`, `build`, `testnet`, `devnet`, `stable:mint`, `create-wallet`, `stable:balance`, `key:*`, `dawn:init` (leave, it is the config bootstrap — but see note), `dawn:config`, `dawn:init_metadata`, `dawn:get_config`. The source files under `cli/commands/{devices,auth,plans,subscriptions,ipam}/` stay untouched.

  Note: `dawn:init` runs device/plan/ipam bootstrap — comment it out too (its instructions are disabled). Keep `dawn:config`, `dawn:init_metadata`, `dawn:get_config`.

- [ ] **Step 2: Validate package.json parses.**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit.**

```bash
git add package.json
git commit -m "chore: remove yarn scripts for disabled features (source kept)"
```

---

## Task 5: Add @sqds/multisig + mainnet TS targeting

**Files:**
- Modify: `package.json` (deps + `dawn:deploy:*` scripts placeholder), `sdk/utils/helpers.ts:11-21`, `cli/shared/cli-utils.ts` (`connect`)
- Test: `cli/commands/deploy/__tests__/targeting.test.ts`

**Interfaces:**
- Produces: `@sqds/multisig` available; `getProgramId()` returns `dawnC74…` under `--mainnet`; `connect()` uses mainnet RPC + program id under `--mainnet`.

- [ ] **Step 1: Add dependency.**

Run: `yarn add @sqds/multisig`
Expected: installs; `package.json` `dependencies` gains `@sqds/multisig`.

- [ ] **Step 2: Extend `getProgramId()`** in `sdk/utils/helpers.ts` to honor `--mainnet`:

```ts
function getProgramId(): PublicKey {
  const anchorToml = toml.parse(readFileSync('./Anchor.toml', 'utf-8'))
  if (hasFlag('--mainnet')) return new PublicKey(anchorToml.programs.mainnet.dawn)
  const isDevnet = hasFlag('--devnet')
  return new PublicKey(
    isDevnet ? anchorToml.programs.devnet.dawn : anchorToml.programs.localnet.dawn,
  )
}
```

- [ ] **Step 3: Extend `connect()`** in `cli/shared/cli-utils.ts` to pick the mainnet RPC. Replace the `rpcUrl` selection with:

```ts
const isMainnet = hasFlag('--mainnet')
const isDevnet = hasFlag('--devnet')
const rpcUrl = isMainnet
  ? MAINNET_RPC_URL ?? 'https://api.mainnet-beta.solana.com'
  : isDevnet
    ? DEVNET_RPC_URL ?? 'https://api.devnet.solana.com'
    : 'http://127.0.0.1:8899'
```

Add `MAINNET_RPC_URL` to the env destructuring next to `DEVNET_RPC_URL` in this file (mirror the existing `DEVNET_RPC_URL` import from `process.env`).

- [ ] **Step 4: Write the failing targeting test** `cli/commands/deploy/__tests__/targeting.test.ts`:

```ts
import { test, expect } from '@jest/globals'
import { execFileSync } from 'child_process'

// getProgramId reads process.argv flags, so assert via a child node process.
function programIdWith(flag: string): string {
  return execFileSync('node', ['-e',
    `process.argv.push('${flag}');` +
    `const t=require('toml').parse(require('fs').readFileSync('./Anchor.toml','utf-8'));` +
    `const f=(x)=>process.argv.includes(x);` +
    `console.log(f('--mainnet')?t.programs.mainnet.dawn:f('--devnet')?t.programs.devnet.dawn:t.programs.localnet.dawn)`
  ], { encoding: 'utf-8' }).trim()
}

test('mainnet flag selects the mainnet program id', () => {
  expect(programIdWith('--mainnet')).toBe('dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP')
})
test('devnet flag selects the devnet program id', () => {
  expect(programIdWith('--devnet')).toBe('dawnt36j2ej84PXrEjrxDjmQb5nAAqCVwTP8f1Y1aYu')
})
```

- [ ] **Step 5: Run it.**

Run: `yarn jest cli/commands/deploy/__tests__/targeting.test.ts -v`
Expected: PASS (Anchor.toml already has all three program blocks from Task 1).

- [ ] **Step 6: Commit.**

```bash
git add package.json yarn.lock sdk/utils/helpers.ts cli/shared/cli-utils.ts cli/commands/deploy/__tests__/targeting.test.ts
git commit -m "feat: add @sqds/multisig and --mainnet targeting"
```

---

## Task 6: Squads proposal helper

**Files:**
- Create: `cli/commands/deploy/squads.ts`
- Test: `cli/commands/deploy/__tests__/squads.test.ts`

**Interfaces:**
- Consumes: `@sqds/multisig`, `@solana/web3.js`.
- Produces:
  - `SQUADS_VAULT_INDEX = 0`
  - `getSquadsVaultPda(multisigPda: PublicKey): PublicKey`
  - `nextTransactionIndex(connection: Connection, multisigPda: PublicKey): Promise<bigint>`
  - `createProposal(params: { connection: Connection; proposer: Keypair; multisigPda: PublicKey; innerInstructions: TransactionInstruction[]; memo: string }): Promise<{ transactionIndex: bigint; createSig: string; proposalSig: string }>` — builds an inner `TransactionMessage` with the vault PDA as payer, then sends `vaultTransactionCreate` and `proposalCreate` (create-only) signed by `proposer`.

- [ ] **Step 1: Write `cli/commands/deploy/squads.ts`:**

```ts
import * as multisig from '@sqds/multisig'
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from '@solana/web3.js'

export const SQUADS_VAULT_INDEX = 0

export function getSquadsVaultPda(multisigPda: PublicKey): PublicKey {
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: SQUADS_VAULT_INDEX })
  return vaultPda
}

export async function nextTransactionIndex(
  connection: Connection,
  multisigPda: PublicKey,
): Promise<bigint> {
  const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda)
  return BigInt(Number(ms.transactionIndex)) + 1n
}

export async function createProposal(params: {
  connection: Connection
  proposer: Keypair
  multisigPda: PublicKey
  innerInstructions: TransactionInstruction[]
  memo: string
}): Promise<{ transactionIndex: bigint; createSig: string; proposalSig: string }> {
  const { connection, proposer, multisigPda, innerInstructions, memo } = params
  const vaultPda = getSquadsVaultPda(multisigPda)
  const transactionIndex = await nextTransactionIndex(connection, multisigPda)

  const { blockhash } = await connection.getLatestBlockhash()
  const transactionMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: innerInstructions,
  })

  const createSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: proposer,
    multisigPda,
    transactionIndex,
    creator: proposer.publicKey,
    vaultIndex: SQUADS_VAULT_INDEX,
    ephemeralSigners: 0,
    transactionMessage,
    memo,
  })
  await connection.confirmTransaction(createSig, 'confirmed')

  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: proposer,
    multisigPda,
    transactionIndex,
    creator: proposer,
  })
  await connection.confirmTransaction(proposalSig, 'confirmed')

  return { transactionIndex, createSig, proposalSig }
}
```

- [ ] **Step 2: Write the failing test** `cli/commands/deploy/__tests__/squads.test.ts` (offline — asserts vault PDA derivation matches the SDK):

```ts
import { test, expect } from '@jest/globals'
import * as multisig from '@sqds/multisig'
import { PublicKey } from '@solana/web3.js'
import { getSquadsVaultPda, SQUADS_VAULT_INDEX } from '../squads'

test('vault PDA matches @sqds/multisig getVaultPda(index 0)', () => {
  const multisigPda = new PublicKey('11111111111111111111111111111112')
  const [expected] = multisig.getVaultPda({ multisigPda, index: SQUADS_VAULT_INDEX })
  expect(getSquadsVaultPda(multisigPda).toBase58()).toBe(expected.toBase58())
})
```

- [ ] **Step 3: Run it.**

Run: `yarn jest cli/commands/deploy/__tests__/squads.test.ts -v`
Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add cli/commands/deploy/squads.ts cli/commands/deploy/__tests__/squads.test.ts
git commit -m "feat: squads create-only proposal helper"
```

---

## Task 7: Dawn instruction builders for the vault

**Files:**
- Create: `cli/commands/deploy/build_ixs.ts`
- Test: `cli/commands/deploy/__tests__/build_ixs.test.ts`

**Interfaces:**
- Consumes: `getDawnProgram` (`cli/shared/cli-utils.ts`), PDA helpers (`sdk/pda/config.ts`), `METADATA_PROGRAM_ID` (`sdk/utils`).
- Produces:
  - `PLACEHOLDER = SystemProgram.programId`
  - `MAINNET_USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')`
  - `buildTokenInstructions(program: Program<Dawn>, vaultPda: PublicKey): Promise<TransactionInstruction[]>` — `[initToken, initFeeAccounts]`.
  - `buildConfigInstructions(program: Program<Dawn>, vaultPda: PublicKey, opts: { stableMint: PublicKey; daoFee: BN; validatorFee: BN; medallionFee: BN }): Promise<TransactionInstruction[]>` — `[initializeConfig, initMetadata]`.

- [ ] **Step 1: Write `cli/commands/deploy/build_ixs.ts`:**

```ts
import { BN, Program } from '@coral-xyz/anchor'
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction } from '@solana/web3.js'
import { Dawn } from '../../../target/types/dawn'
import {
  getConfigPda, getTokenConfigPda,
  getFeePoolDawnAccountPda, getDaoDawnAccountPda,
  getValidatorDawnAccountPda, getMedallionDawnAccountPda,
} from '../../../sdk/pda/config'
import { METADATA_PROGRAM_ID } from '../../../sdk/utils'

export const PLACEHOLDER = SystemProgram.programId
export const MAINNET_USDC = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')

function dawnMintPda(program: Program<Dawn>): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from('dawn')], program.programId)[0]
}

export async function buildTokenInstructions(
  program: Program<Dawn>, vaultPda: PublicKey,
): Promise<TransactionInstruction[]> {
  const tokenConfig = getTokenConfigPda(program)
  const dawnMint = dawnMintPda(program)
  const callerDawnAccount = getAssociatedTokenAddressSync(dawnMint, vaultPda, true)

  const initToken = await program.methods.initToken().accountsStrict({
    caller: vaultPda,
    tokenConfig,
    dawnMint,
    callerDawnAccount,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }).instruction()

  const initFeeAccounts = await program.methods.initFeeAccounts().accountsStrict({
    caller: vaultPda,
    tokenConfig,
    dawnMint,
    feePoolDawnAccount: getFeePoolDawnAccountPda(program),
    daoDawnAccount: getDaoDawnAccountPda(program),
    validatorDawnAccount: getValidatorDawnAccountPda(program),
    medallionDawnAccount: getMedallionDawnAccountPda(program),
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }).instruction()

  return [initToken, initFeeAccounts]
}

export async function buildConfigInstructions(
  program: Program<Dawn>, vaultPda: PublicKey,
  opts: { stableMint: PublicKey; daoFee: BN; validatorFee: BN; medallionFee: BN },
): Promise<TransactionInstruction[]> {
  const tokenConfig = getTokenConfigPda(program)
  const dawnMint = dawnMintPda(program)
  const [config] = getConfigPda(program)

  const initializeConfig = await program.methods
    .initializeConfig(opts.daoFee, opts.validatorFee, opts.medallionFee)
    .accountsStrict({
      caller: vaultPda,
      apiAuthority: vaultPda,
      tokenConfig,
      config,
      stableMint: opts.stableMint,
      dawnMint,
      feePoolDawnAccount: getFeePoolDawnAccountPda(program),
      daoDawnAccount: getDaoDawnAccountPda(program),
      validatorDawnAccount: getValidatorDawnAccountPda(program),
      medallionDawnAccount: getMedallionDawnAccountPda(program),
      raydium: PLACEHOLDER,
      raydiumAuthority: PLACEHOLDER,
      raydiumConfig: PLACEHOLDER,
      raydiumPool: PLACEHOLDER,
      raydiumObservation: PLACEHOLDER,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    }).instruction()

  const [metadata] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), dawnMint.toBuffer()],
    METADATA_PROGRAM_ID,
  )
  const initMetadata = await program.methods.initMetadata().accountsStrict({
    caller: vaultPda,
    tokenConfig,
    config,
    dawnMint,
    metadata,
    tokenMetadataProgram: METADATA_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  }).instruction()

  return [initializeConfig, initMetadata]
}
```

Note: confirm the `initMetadata` account names against `target/idl/dawn.json` (`accountsStrict` keys are camelCase of the Rust context fields). If the IDL differs, use the IDL's names — mirror `cli/commands/config/init_metadata.ts`.

- [ ] **Step 2: Write the failing test** `cli/commands/deploy/__tests__/build_ixs.test.ts` (offline; builds a Program over a dummy connection and asserts the instructions target the dawn program with `caller = vault` and USDC as stable):

```ts
import { test, expect, beforeAll } from '@jest/globals'
import { AnchorProvider, Program, Wallet, BN } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { Dawn } from '../../../target/types/dawn'
import { getIDL } from '../../shared/cli-utils'
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
```

- [ ] **Step 3: Ensure the IDL/types exist** (`anchor build` was run in Task 3). Run the test.

Run: `yarn jest cli/commands/deploy/__tests__/build_ixs.test.ts -v`
Expected: PASS. (If `initMetadata` account names mismatch, fix per the Step-1 note, then re-run.)

- [ ] **Step 4: Commit.**

```bash
git add cli/commands/deploy/build_ixs.ts cli/commands/deploy/__tests__/build_ixs.test.ts
git commit -m "feat: dawn vault instruction builders for token + config proposals"
```

---

## Task 8: Proposal entrypoints + yarn scripts

**Files:**
- Create: `cli/commands/deploy/create_token_proposal.ts`, `cli/commands/deploy/create_config_proposal.ts`
- Modify: `package.json` (`scripts`)

**Interfaces:**
- Consumes: `connect` (`cli/shared/cli-utils.ts`), `getWallet`, `createProposal`/`getSquadsVaultPda` (Task 6), `buildTokenInstructions`/`buildConfigInstructions`/`MAINNET_USDC` (Task 7), `getFlag` (`cli/shared/cli-utils.ts`).
- Produces: runnable proposal creators; the multisig address comes from `--multisig <pubkey>`; fees from `--dao-fee/--validator-fee/--medallion-fee` (defaults 300/300/900); stable mint from `--stable-mint <pubkey>` (default `MAINNET_USDC`).

- [ ] **Step 1: Write `cli/commands/deploy/create_token_proposal.ts`:**

```ts
import { PublicKey } from '@solana/web3.js'
import { connect, getWallet, getFlag } from '../../shared/cli-utils'
import { createProposal, getSquadsVaultPda } from './squads'
import { buildTokenInstructions } from './build_ixs'

async function main() {
  const multisigPda = new PublicKey(getFlag('--multisig'))
  const { program, connection } = await connect()
  const proposer = getWallet().payer
  const vaultPda = getSquadsVaultPda(multisigPda)
  console.log({ multisig: multisigPda.toBase58(), vault: vaultPda.toBase58(), proposer: proposer.publicKey.toBase58() })

  const innerInstructions = await buildTokenInstructions(program, vaultPda)
  const res = await createProposal({
    connection, proposer, multisigPda, innerInstructions,
    memo: 'DAWN token init (init_token + init_fee_accounts)',
  })
  console.log('Proposal A created', { transactionIndex: res.transactionIndex.toString(), ...res })
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Write `cli/commands/deploy/create_config_proposal.ts`:**

```ts
import { BN } from '@coral-xyz/anchor'
import { PublicKey } from '@solana/web3.js'
import { connect, getWallet, getFlag, hasFlag } from '../../shared/cli-utils'
import { createProposal, getSquadsVaultPda } from './squads'
import { buildConfigInstructions, MAINNET_USDC } from './build_ixs'

function feeFlag(name: string, dflt: number): BN {
  return new BN(hasFlag(name) ? Number(getFlag(name)) : dflt)
}

async function main() {
  const multisigPda = new PublicKey(getFlag('--multisig'))
  const stableMint = hasFlag('--stable-mint') ? new PublicKey(getFlag('--stable-mint')) : MAINNET_USDC
  const { program, connection } = await connect()
  const proposer = getWallet().payer
  const vaultPda = getSquadsVaultPda(multisigPda)
  console.log({ multisig: multisigPda.toBase58(), vault: vaultPda.toBase58(), stableMint: stableMint.toBase58() })

  const innerInstructions = await buildConfigInstructions(program, vaultPda, {
    stableMint,
    daoFee: feeFlag('--dao-fee', 300),
    validatorFee: feeFlag('--validator-fee', 300),
    medallionFee: feeFlag('--medallion-fee', 900),
  })
  const res = await createProposal({
    connection, proposer, multisigPda, innerInstructions,
    memo: 'DAWN config (initialize_config + init_metadata), authority -> vault',
  })
  console.log('Proposal B created', { transactionIndex: res.transactionIndex.toString(), ...res })
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Add yarn scripts** to `package.json` `scripts`:

```json
"dawn:deploy:token-proposal": "yarn build && node dist/cli/commands/deploy/create_token_proposal.js",
"dawn:deploy:config-proposal": "yarn build && node dist/cli/commands/deploy/create_config_proposal.js"
```

- [ ] **Step 4: Type-check compiles.**

Run: `yarn build 2>&1 | tail -5`
Expected: `tsc` completes without errors; `dist/cli/commands/deploy/*.js` exist.

- [ ] **Step 5: Commit.**

```bash
git add cli/commands/deploy/create_token_proposal.ts cli/commands/deploy/create_config_proposal.ts package.json
git commit -m "feat: token + config proposal entrypoints and yarn scripts"
```

---

## Task 9: External-party runbook

**Files:**
- Create: `docs/mainnet-deployment.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a self-contained runbook.

- [ ] **Step 1: Write `docs/mainnet-deployment.md`** covering, in order:
  1. **Devtooling setup** — install Rust 1.87.0 (`rustup toolchain install 1.87.0`), Agave/Solana CLI 3.1.14 (`sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.14/install)"`), Anchor 0.32.1 via avm (`avm install 0.32.1 && avm use 0.32.1`), Node 20+, `corepack enable yarn`; then `yarn install`.
  2. **Prerequisites** — obtain the `dawnC74…` program keypair out-of-band (never in the repo); create a Squads v4 multisig at app.squads.so (members + threshold), record the multisig address; derive/record the vault PDA (`node -e "…getVaultPda index 0…"` snippet); fund the hot wallet (~5 SOL for deploy) and the **vault** (≥0.1 SOL for config/token PDA rent).
  3. **Phase 1 — Deploy:** `anchor build -- --features mainnet`; `solana program deploy target/deploy/dawn.so --program-id dawnC74…json --keypair <hot-wallet> --url mainnet-beta`.
  4. **Phase 2 — Transfer upgrade authority:** `solana program set-upgrade-authority dawnC74… --new-upgrade-authority <vault_pda> --keypair <hot-wallet> --url mainnet-beta`.
  5. **Phase 3 — Create proposals:** `yarn dawn:deploy:token-proposal --mainnet --multisig <multisig>`; then `yarn dawn:deploy:config-proposal --mainnet --multisig <multisig>` (options: `--stable-mint`, `--dao-fee`, `--validator-fee`, `--medallion-fee`).
  6. **Phase 4 — Approve + execute:** in app.squads.so, members approve to threshold and execute Proposal A then Proposal B.
  7. **Phase 5 — Verify:** `yarn dawn:get_config --mainnet` shows `authority` = vault; `spl-token accounts --owner <vault>` / explorer shows 1B DAWN and DAWN metadata.
  8. **Devnet dry-run** — the same steps with `--devnet` and a devnet Squads multisig + a valid devnet stable mint (`--stable-mint <devnet-mint>`).
  9. **Custody note** — the program keypair is a deploy secret; never commit it.

- [ ] **Step 2: Commit.**

```bash
git add docs/mainnet-deployment.md
git commit -m "docs: external-party mainnet deployment runbook"
```

---

## Task 10: End-to-end verification + PR

**Files:** none (verification + PR)

- [ ] **Step 1: Clean build (localnet id).** Run: `anchor build 2>&1 | tail -5` — expected `Finished`, no warnings.
- [ ] **Step 2: Mainnet-id build.** Run: `anchor build -- --features mainnet && node -e "console.log(require('./target/idl/dawn.json').address)"` — expected `dawnC74…`. Then `anchor build` to restore localnet id.
- [ ] **Step 3: IDL surface.** Run the Task 2 Step 3 check — expected 5 instructions.
- [ ] **Step 4: Trimmed suite.** Run: `yarn test 2>&1 | grep -E "Tests:|Test Suites:|✕"` — expected all pass, zero `✕`.
- [ ] **Step 5: Unit tests.** Run: `yarn jest cli/commands/deploy -v` — expected all PASS.
- [ ] **Step 6: TS build.** Run: `yarn build` — expected no errors.
- [ ] **Step 7: Devnet dry-run (manual, documented).** Following `docs/mainnet-deployment.md` devnet section against a throwaway devnet Squads multisig, create Proposal A + B, approve/execute in the Squads UI, and confirm `yarn dawn:get_config --devnet` shows `authority` = vault. Record the tx signatures in the PR description. (This is the acceptance test; if the compiled message for a proposal exceeds the create-tx size limit, split that proposal into per-instruction proposals in `create_*_proposal.ts` and re-run.)
- [ ] **Step 8: Push + open PR.**

```bash
git push -u origin DAWN-minimal-deploy-squads
gh pr create --base master --title "Minimal deploy + Squads-governed configuration" --body-file <(printf '%s\n' "See docs/superpowers/specs/2026-08-31-minimal-deploy-squads-design.md and docs/mainnet-deployment.md.")
```

---

## Self-Review (completed by author)

- **Spec coverage:** §4.1 disable → Task 2; §4.2 mainnet id → Task 1; §4.3 CLI cleanup → Task 4; §5 flow → runbook (Task 9) + proposals (Tasks 6–8); §6 tooling → Tasks 5–8; §7 runbook → Task 9; §8 testing → Tasks 3, 10; §9 risks (message size) → Task 10 Step 7. Covered.
- **Placeholder scan:** no TBD/TODO; every code step has real code. The `initMetadata` account-name caveat points to the IDL as the source of truth (verifiable), not a placeholder.
- **Type consistency:** `getSquadsVaultPda`, `createProposal`, `buildTokenInstructions`, `buildConfigInstructions`, `MAINNET_USDC`, `PLACEHOLDER` names are used consistently across Tasks 6–8; PDA helper names match `sdk/pda/config.ts`.
