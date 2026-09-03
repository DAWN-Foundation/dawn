# Minimal Deploy + Squads-Governed Configuration — Design

Date: 2026-08-31
Branch: `DAWN-minimal-deploy-squads`
Status: Proposed (awaiting review)

## 1. Goal

Reduce the DAWN program to a minimal, mainnet-deployable surface and restructure the
deploy/configuration flow so it can be executed by an external party using a Solana hot
wallet for deployment and a **Squads v4 multisig** for all privileged configuration.

Concretely:

1. Disable (comment out, do not delete) all program functionality **except** deploying,
   minting the DAWN token, and configuring the contract to set its authority.
2. Restructure deploy + config into: hot-wallet deploy → transfer upgrade authority to a
   Squads multisig → Squads **proposals** perform token init + config (authority becomes the
   multisig vault).
3. Produce a self-contained markdown runbook so an external party can execute the whole
   flow given only the repository + the document.

## 2. Decisions (locked)

- **Squads tooling:** official `@sqds/multisig` TypeScript SDK.
- **Proposal lifecycle:** scripts **create** proposals only; multisig members approve and
  execute in the Squads web app (app.squads.so).
- **Target network:** mainnet-beta. Scripts must also run against devnet for dry-runs.
- **Swap/config placeholders:** swaps stay disabled, so `initialize_config`'s five Raydium
  accounts (all `UncheckedAccount`, stored-not-validated) get placeholder pubkeys, and
  `config.stable_mint` = mainnet USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. No
  Raydium pool, no liquidity, no throwaway mint.
- **Mainnet program ID:** `dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP` (repo vanity keypair
  `dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP.json`, gitignored). `declare_id!` gets the
  public key; the private keypair is handed to the deployer out-of-band (not via the repo).

## 3. Non-goals

- No deletion of disabled code; re-enabling later is just uncommenting.
- No changes to the business logic of the kept instructions.
- No Raydium pool / liquidity provisioning.
- No on-chain "mint more DAWN" capability beyond the existing fixed 1B mint in `init_token`
  (DAWN mint authority is the `token_config` PDA; `init_token` is the only mint path).
- The scripts do not approve/execute proposals (members do that in the Squads UI).

## 4. Program changes (`programs/dawn/src`)

### 4.1 Disable instructions
In `lib.rs`, comment out the 24 non-kept `#[program]` entry points, keeping only:
`init_token`, `init_fee_accounts`, `initialize_config`, `init_metadata`, `update_config`.

Disabled (kept as commented code): all AMF (`register_auth_method`, `add_auth_method`,
`register_credential`, `register_credential_for`, `revoke_credential`, `register_connection`,
`revoke_connection`), DEVICES (`add_device_model`, `add_device`, `add_device_for`,
`verify_device_location`), PLANS (`add_service_agreement`, `add_l3_plan`, `add_l2_plan`),
SUBSCRIPTIONS (`subscribe`, `subscribe_for`, `extend_subscription`,
`extend_subscription_for`), CLAIM (`claim`), IPAM (`initialize_root_ip_block`, `allocate_ip`,
`lease_subscription_ip`, `lease_subscription_ip_for`, `revoke_ip`).

The domain modules under `app/` stay declared in `app/mod.rs` and keep compiling as ordinary
library code. Analysis (subagent-verified): the crate is a lib crate so unused `pub` items
emit no `dead_code` warnings; `events.rs`, `state/`, and `error.rs` do not depend upward on
the domain handlers, so this compiles cleanly with zero warnings. IDL no longer exposes the
disabled instructions. This is the smallest, lowest-risk seam and satisfies "disabled but
kept as is."

### 4.2 Mainnet program ID
Add a feature-gated `declare_id!` for mainnet. Current `lib.rs` has:
- `#[cfg(not(feature = "devnet"))] declare_id!("4yBWX…")` (localnet)
- `#[cfg(feature = "devnet")] declare_id!("dawnt36…")` (devnet)

Add a `mainnet` cargo feature and a matching `#[cfg(feature = "mainnet")]
declare_id!("dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP")`, adjusting the `cfg` guards so
exactly one id is selected (mainnet > devnet > localnet). Add `mainnet = []` to
`programs/dawn/Cargo.toml [features]`. Mainnet build: `anchor build -- --features mainnet`.

### 4.3 CLI cleanup
Comment out the now-dead `yarn dawn:*` scripts for disabled features in `package.json` and
their CLI entrypoints (devices, plans, subscriptions, auth, ipam), leaving the underlying
`sdk/`/`cli/` source files in place. Keep: config (`init`→replaced, `config`,
`init_metadata`, `get_config`, `update_config`), `stable:mint` utilities, key utilities.

## 5. Deploy + configuration flow

All privileged config runs **as the Squads vault PDA** (`["multisig", <multisig>, "vault",
u8(0)]` under program `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`). Because the vault signs
the wrapped instructions, `initialize_config`'s `caller` = vault ⇒ `config.authority` = vault.

### Phase 1 — Deploy (hot wallet)
- `anchor build -- --features mainnet` (produces program at `dawnC74…`).
- `anchor deploy` / `solana program deploy` with the hot-wallet keypair as fee payer and
  upgrade authority, using the `dawnC74…` program keypair.

### Phase 2 — Transfer upgrade authority (hot wallet)
- `solana program set-upgrade-authority dawnC74… --new-upgrade-authority <squads_vault_pda>`.

### Phase 3 — Create Squads proposals (script, proposer)
Two vault transactions + proposals (create-only), each executed by the vault. Instruction
order matters because `init_metadata` requires `config.authority == caller`:

- **Proposal A — token init:** `init_token` (creates `token_config` PDA + DAWN mint, mints
  the fixed 1B DAWN to the vault's DAWN ATA which `init_token` creates itself) →
  `init_fee_accounts` (creates the 4 fee PDA token accounts).
- **Proposal B — config + metadata:** `initialize_config` (creates `config`,
  `authority`=vault, `api_authority`=vault, `stable_mint`=USDC, Raydium fields=placeholder
  pubkeys, fees per input) → `init_metadata` (sets DAWN Metaplex metadata; passes because
  `config.authority`==vault==caller).

If Proposal A's or B's compiled inner message exceeds the ~1232-byte create-transaction
limit, split further (e.g., one instruction per proposal). Finalized during implementation.

### Phase 4 — Approve + execute (multisig members, Squads UI)
Members approve to threshold and execute both proposals in app.squads.so.

### Phase 5 — Verify
`yarn dawn:get_config` (pointed at mainnet) confirms `authority` = vault, mints, fee
accounts; `spl-token` / explorer confirms 1B DAWN in the vault DAWN ATA and DAWN metadata.

## 6. Tooling structure (new)

New module `cli/commands/deploy/` (TypeScript, run via `yarn` + `ts-node`/compiled `dist`):

- `squads.ts` — thin wrapper over `@sqds/multisig`: derive multisig/vault/transaction/proposal
  PDAs, read `multisig.transactionIndex`, build `vaultTransactionCreate` + `proposalCreate`
  instructions from a list of inner `TransactionInstruction`s, send as the proposer.
- `build_ixs.ts` — builds the raw dawn instructions (`init_token`, `init_fee_accounts`,
  `initialize_config`, `init_metadata`) via the Anchor program client with the vault PDA as
  `caller`/authority and USDC/placeholder Raydium keys.
- `create_token_proposal.ts` — Proposal A.
- `create_config_proposal.ts` — Proposal B.
- Inputs (env/flags): RPC URL, hot-wallet keypair (proposer/fee payer), Squads multisig
  address, program ID, USDC mint (default mainnet), fee bps (dao/validator/medallion).

New `yarn` scripts: `dawn:deploy:token-proposal`, `dawn:deploy:config-proposal` (and any
split variants).

Dependency: add `@sqds/multisig` to `package.json`.

## 7. External-party runbook

`docs/mainnet-deployment.md` — self-contained, covering:
- Devtooling setup: Rust 1.87.0, Agave/Solana CLI 3.1.14, Anchor 0.32.1 via avm, Node + yarn;
  `yarn install`.
- Prerequisites: obtain the `dawnC74…` program keypair (out-of-band); create the Squads v4
  multisig (members + threshold) and record its address + derived vault PDA; fund the hot
  wallet (~ deploy cost) and the vault (rent for the config/token PDAs).
- Phases 1→5 with exact commands, expected output, and verification.
- A devnet dry-run section using the same scripts with `--devnet`.

## 8. Testing strategy

- **Program:** `anchor build` (localnet + `--features mainnet` for the id) must compile with
  zero warnings; run the existing unit-test suite — the KEEP-set tests (config, token,
  metadata) must still pass, and disabled-instruction tests are removed/skipped from the
  accumulative runner since those instructions no longer exist. Confirm the IDL contains only
  the 5 kept instructions.
- **Tooling:** dry-run the proposal scripts against **devnet** with a real (test) Squads
  multisig: create Proposal A + B, approve+execute in the Squads UI, then `get_config`
  verifies `authority` = vault and DAWN minted to the vault. This is the end-to-end
  acceptance test for the runbook before mainnet. Note: the `stable_mint` input is
  network-specific — mainnet USDC on mainnet, a valid devnet mint (e.g. devnet USDC-Dev) for
  the dry-run — since the mainnet USDC address does not exist on devnet.

## 9. Risks / open items

- **Message size:** combined instructions per proposal may exceed the create-tx limit; the
  split is finalized empirically during implementation (§5 Phase 3).
- **Accumulative test suite:** `tests/dawn/dawn.test.ts` chains device→plan→subscription→…
  which are being disabled. Those describe-blocks must be removed/skipped so the runner still
  passes on the KEEP set only. This trims the suite from 158 tests to the config/token subset.
- **`update_config` availability:** kept and callable by the multisig (authority = vault) to
  later set real Raydium accounts / `api_authority` when features are re-enabled.
- **Program keypair custody:** the `dawnC74…` private keypair is a deploy secret handed to the
  deployer separately; the runbook states this explicitly and never commits it.

## 10. Deliverable

Everything above lands on branch `DAWN-minimal-deploy-squads` and ships as a PR.
