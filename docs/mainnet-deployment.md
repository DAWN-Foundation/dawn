# DAWN Mainnet Deployment Runbook

This is a self-contained, step-by-step runbook for deploying the DAWN program to Solana
mainnet-beta and handing control of it to a Squads v4 multisig. It assumes only:

- a clone of this repository, and
- this document.

It is written for an external party (someone outside the core team) performing the
deployment. Follow the phases in order — do not skip ahead.

**Terminology used throughout this doc:**

| Placeholder | Meaning |
|---|---|
| `<hot-wallet>` | Path to a local Solana keypair JSON file used only to pay for the deploy transaction and to hold the (temporary) upgrade authority until it is handed to the vault. |
| `<multisig>` | The Squads v4 multisig account address (base58 pubkey), created in Prerequisites. |
| `<vault_pda>` | The Squads vault PDA derived from `<multisig>` at vault index 0 (derived in Prerequisites). This becomes the program's upgrade authority and the DAWN protocol's `config.authority`. |
| `<NEW_ID>` | The real program ID you grind yourself in Prerequisites (§2.1) — the base58 pubkey of your freshly generated `dawn…` vanity keypair. Substitute your actual value everywhere this appears in a command. |
| `dawnC74…` | Shorthand in prose for "your mainnet `<NEW_ID>`". The repo ships with the literal placeholder `dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP` baked in for local/CI builds — it is **not** a real program identity anyone controls. You replace it with your own ground id in Prerequisites (§2.1) before building. |
| `dawnt36…` | Shorthand in prose for "your devnet `<NEW_ID>`". Same deal: the repo placeholder is `dawnt36j2ej84PXrEjrxDjmQb5nAAqCVwTP8f1Y1aYu`, replaced the same way for the devnet dry-run (§8). |

---

## 1. Devtooling setup

Install the exact toolchain versions this repository is pinned to.

### 1.1 Rust

```bash
# If rustup isn't installed yet:
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
. "$HOME/.cargo/env"

# Install the pinned toolchain
rustup toolchain install 1.87.0
rustup default 1.87.0
rustc --version   # should report 1.87.0
```

### 1.2 Agave / Solana CLI 3.1.14

```bash
sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.14/install)"

# Follow the on-screen instructions to add solana to your PATH, then:
solana --version
```

### 1.3 Anchor 0.32.1 via avm

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.32.1
avm use 0.32.1
anchor --version   # should report anchor-cli 0.32.1
```

### 1.4 Node.js + Yarn

```bash
# Node.js 20 or later, then:
corepack enable yarn
node --version     # >= 20
yarn --version
```

### 1.5 Install repo dependencies

From the repository root:

```bash
yarn install
```

---

## 2. Prerequisites

Complete all of these before touching Phase 1.

### 2.1 Generate the program keypair (vanity address)

The `dawnC74…` / `dawnt36…` ids committed in `programs/dawn/src/lib.rs` and
`Anchor.toml` are **placeholder** values for local/CI builds — they are not a real
program identity anyone controls. Every deployer generates their **own** fresh keypair
before building, and that keypair's pubkey becomes the real, permanent program ID for
their deployment. This applies to devnet too (§8) — don't reuse the placeholder there
either.

1. Grind a vanity keypair whose pubkey starts with `dawn`:

   ```bash
   solana-keygen grind --starts-with dawn:1
   ```

   Add `--ignore-case` if you're fine matching `dawn`/`Dawn`/`DAWN`/etc.
   case-insensitively (faster). Grind time grows fast with each extra required
   character — 4 characters (`dawn`) is quick (seconds), 6+ can take much longer. This
   writes a file named `<PUBKEY>.json` into your current directory, e.g.
   `dawnXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.json`.

2. **Back it up immediately**, before doing anything else with it. Copy the full file
   contents into 1Password (or your organization's secret manager) under a clearly
   labeled entry (e.g. "DAWN mainnet program keypair"). This keypair **is** the
   program's on-chain identity, and it is also the program's **upgrade authority** at
   the moment of deploy (§3/§4 transfer that authority away from it to the vault, but
   the keypair itself remains the program's identity forever). If this file is lost
   before it's backed up, the program can never be deployed or upgraded at that address
   again — there is no recovery path.

   It is already covered by this repo's `.gitignore` (`/dawn**.json`), so a plain `git
   add` won't pick it up — but double-check before committing anything and never push
   it to any remote.

3. Replace the placeholder id with your ground pubkey in **both** files that hard-code
   it — `programs/dawn/src/lib.rs` and `Anchor.toml`. This is portable across
   macOS/Linux:

   ```bash
   # DEVNET (use --mainnet <NEW_ID> for the mainnet deploy):
   yarn dawn:deploy:set-program-id --devnet <NEW_ID>
   ```

   This reads the current placeholder id for that network out of `Anchor.toml` and
   replaces it in **both** `programs/dawn/src/lib.rs` (the `declare_id!`) and
   `Anchor.toml`, then prints a `grep` you can run to verify. `<NEW_ID>` is your ground
   pubkey — the basename of the `.json` keypair file without the extension.

   `<NEW_ID>` must exactly match the pubkey encoded in your `.json` keypair filename —
   `solana program deploy` (§3) will reject a `--program-id` keypair file whose
   embedded pubkey doesn't match the program ID baked into the built binary. Keep the
   `.json` file itself (see step 2 above) — the build only needs the id as text; the
   deploy step needs the actual keypair file.

   Move or copy the `.json` file somewhere durable outside the repo working tree once
   you're done, e.g. `~/secrets/<NEW_ID>.json` — you'll pass its path as `--program-id`
   in §3.

Treat this file with the same care as any private key that can overwrite a mainnet
program's code — see the Custody Note (§9) at the end of this document.

### 2.2 Create the Squads v4 multisig

How you create the multisig differs by network:

**Mainnet:**

1. Go to [app.squads.so](https://app.squads.so) and connect a wallet on **mainnet**.
2. Create a new multisig (Squads Protocol v4):
   - Add the member public keys who will approve deployments.
   - Set an approval threshold (e.g. 2-of-3).
3. Confirm creation and copy the **multisig account address**. This is `<multisig>`
   for every command below.

**Devnet:** the devnet Squads UI (backup.app.squads.so) does not expose a simple
multisig-creation flow, so use this repo's script instead:

1. Make sure the deployer wallet (`~/.config/solana/id.json` by default) is funded with
   devnet SOL first — the script uses this wallet as the creator and fee-payer for the
   multisig-creation transaction:

   ```bash
   solana airdrop 2 --url devnet
   # repeat, or use a faucet, if you need more
   ```
2. Run:

   ```bash
   yarn dawn:deploy:create-multisig --devnet
   ```

   By default this creates a **1-of-1** multisig: the deployer wallet is the sole
   member, with full permissions, and the approval threshold is 1 — so a single
   operator can approve and execute proposals themselves later in the flow. To add more
   members or raise the threshold:

   ```bash
   yarn dawn:deploy:create-multisig --devnet --members <pubkey1>,<pubkey2> --threshold 2
   ```

3. Copy the printed `MULTISIG ADDRESS` — this is `<multisig>` for every devnet command
   below. The script also prints a `VAULT PDA (idx 0)` (see §2.3) and next-step hints.

**Adding a co-signer to a devnet multisig (optional, devnet only).** If you want a
second wallet (e.g. a Phantom wallet) to vote and execute from the Squads UI, add it as a
member. Because the script-created multisig is autonomous (member-controlled), this goes
through a config transaction that the deployer wallet creates, approves, and executes in
one shot — which works while the multisig is 1-of-1:

```bash
yarn dawn:deploy:add-member --devnet --multisig <multisig> --member <new-member-pubkey>
```

The new member receives full permissions (initiate + vote + execute). Adding a member
does **not** change the threshold, so a 1-of-1 becomes **1-of-2** (either member alone can
approve and execute). On mainnet, add/remove members from the Squads web UI instead.

### 2.3 Derive the vault PDA

The Squads vault (index 0) is the account that will hold upgrade authority over the
program and `config.authority`/`api_authority` over the DAWN protocol config.

- **Devnet:** already printed by `yarn dawn:deploy:create-multisig --devnet` in §2.2 as
  `VAULT PDA (idx 0)` — just copy it as `<vault_pda>`, no extra step needed.
- **Mainnet:** derive it locally with the `@sqds/multisig` SDK already installed by
  `yarn install`:

  ```bash
  node -e "
  const m = require('@sqds/multisig');
  const { PublicKey } = require('@solana/web3.js');
  const multisigPda = new PublicKey('<multisig>');
  const [vaultPda] = m.getVaultPda({ multisigPda, index: 0 });
  console.log(vaultPda.toBase58());
  "
  ```

  Record the printed address as `<vault_pda>`. It should also be visible in the Squads
  UI as the multisig's "Vault 1" address.

### 2.4 Fund the hot wallet and the vault

Two separate funding sources are needed:

- **Hot wallet** (`<hot-wallet>`) — pays for the program deploy transaction (program
  binary rent-exempt storage + fees). Fund with **~5 SOL**:

  ```bash
  solana balance <hot-wallet-pubkey> --url mainnet-beta
  ```

- **Vault** (`<vault_pda>`) — pays rent for the accounts created by the Squads
  proposals in Phase 3 (`token_config`, DAWN mint, the four fee-pool token accounts,
  `config`, the DAWN metadata account, and the vault's own DAWN ATA). Fund with
  **at least 0.1 SOL**:

  ```bash
  solana balance <vault_pda> --url mainnet-beta
  ```

  Transfer SOL to `<vault_pda>` like any normal wallet address (it is a PDA but can
  receive lamports via a plain system transfer).

---

## 3. Phase 1 — Deploy the program (hot wallet)

Build the program with the `mainnet` Cargo feature, which bakes the `dawnC74…` program
ID into the binary, the IDL (`target/idl/dawn.json`), and the generated TS types
(`target/types/dawn.ts`) that the CLI commands in Phase 3 read from:

```bash
anchor build -- --features mainnet
```

Deploy the built binary to your `dawnC74…` program ID, paid for and signed by the hot
wallet:

```bash
solana program deploy target/deploy/dawn.so \
  --program-id <path-to>/<NEW_ID>.json \
  --keypair <hot-wallet> \
  --url mainnet-beta
```

Note the two different keys in this command:
- `--program-id` takes the **program keypair file** you generated in §2.1 (the deploy
  secret that proves ownership of `dawnC74…`).
- `--keypair` takes the **hot wallet** (§2.4) that pays fees and becomes the initial
  upgrade authority.

> **Important:** Do not run `anchor build` again with a different `--features` value
> (e.g. `--devnet`) before finishing Phase 3 below — that would overwrite
> `target/idl/dawn.json` / `target/types/dawn.ts` with a different program ID, and the
> Phase 3 CLI scripts read the program ID from those generated files, not from the
> `--mainnet` flag alone.

---

## 4. Phase 2 — Transfer upgrade authority to the vault (hot wallet)

Hand off upgrade authority from the hot wallet to the Squads vault PDA:

```bash
solana program set-upgrade-authority <NEW_ID> \
  --new-upgrade-authority <vault_pda> \
  --skip-new-upgrade-authority-signer-check \
  --keypair <hot-wallet> \
  --url mainnet-beta
```

`--skip-new-upgrade-authority-signer-check` is **required** here: by default the CLI makes
the new authority co-sign (a guard against typos), but the vault PDA is a program-derived
address with no private key, so it cannot sign. The current authority — your
`--keypair <hot-wallet>` — still signs the change.

After this, the hot wallet can no longer upgrade the program — only a Squads proposal
executed through `<multisig>` can. Verify:

```bash
solana program show <NEW_ID> --url mainnet-beta
# "Upgrade Authority" should now read <vault_pda>
```

---

## 5. Phase 3 — Create the Squads proposals (proposer)

These are the `yarn dawn:deploy:*` scripts, run from the repo root. They build the DAWN
instructions with the vault PDA as `caller`/authority, wrap them in a Squads vault
transaction, and create the corresponding proposal (create-only — they do not approve
or execute anything).

The wallet used to sign and pay for proposal creation is `~/.config/solana/id.json` by
default, or the path passed via `--wallet <path>`. **This wallet is the proposer /
fee-payer for the Squads transaction and must be a member of `<multisig>` with
"initiate" permission** — it is not the vault and does not become any on-chain
authority.

### 5.1 Proposal A — token init

Creates the `token_config` PDA, the DAWN mint (6 decimals), mints the fixed
1,000,000,000 DAWN supply into the vault's DAWN ATA, and creates the four fee-pool DAWN
token accounts.

```bash
yarn dawn:deploy:token-proposal --mainnet --multisig <multisig>

# or, with an explicit proposer wallet:
yarn dawn:deploy:token-proposal --mainnet --multisig <multisig> --wallet <path-to-proposer-keypair.json>
```

### 5.2 Proposal B — config + metadata

Creates the `config` account (`authority` = `<vault_pda>`, `api_authority` =
`<vault_pda>`, `stable_mint` = mainnet USDC by default), then sets the DAWN Metaplex
metadata. Run this after Proposal A is created. It is safe to create Proposal B before
Proposal A executes — but Proposal A must be **executed** (not just created) before
Proposal B is executed, since Proposal B's instructions reference accounts
(`token_config`, the DAWN mint) that only exist once Proposal A has run on-chain — see
Phase 4.

```bash
yarn dawn:deploy:config-proposal --mainnet --multisig <multisig>
```

Optional flags (defaults shown):

| Flag | Default | Meaning |
|---|---|---|
| `--stable-mint <pubkey>` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (mainnet USDC) | The stablecoin mint stored as `config.stable_mint`. |
| `--dao-fee <bps>` | `300` | DAO fee, in basis points. |
| `--validator-fee <bps>` | `300` | Validator fee, in basis points. |
| `--medallion-fee <bps>` | `900` | Medallion fee, in basis points. |

Example overriding fees:

```bash
yarn dawn:deploy:config-proposal --mainnet --multisig <multisig> \
  --dao-fee 250 --validator-fee 250 --medallion-fee 950
```

Each command prints the multisig, vault, and the created `transactionIndex` — record
these; they are Proposal A and Proposal B's index in the Squads UI.

---

## 6. Phase 4 — Approve and execute (multisig members)

In [app.squads.so](https://app.squads.so), open `<multisig>`:

1. Locate **Proposal A** (token init, transaction index printed in §5.1). Have members
   approve until the configured threshold is met, then **Execute**.
2. Only after Proposal A has executed successfully, locate **Proposal B** (config +
   metadata, transaction index printed in §5.2), approve to threshold, and **Execute**.

Executing out of order (B before A) will fail on-chain, since `initialize_config` and
`init_metadata` in Proposal B depend on accounts (`token_config`, the DAWN mint) that
Proposal A creates.

---

## 7. Phase 5 — Verify

### 7.1 Config account

```bash
yarn dawn:get_config --mainnet
```

Confirm the printed `authority` equals `<vault_pda>`, and that `stableMint`, `daoFee`,
`validatorFee`, `medallionFee` match what was submitted in §5.2. (`config.api_authority`
is also set to `<vault_pda>` on-chain by Proposal B, though this script does not print
it — see §7.1's independent check below if you need to confirm it directly.)

> Note: `dawn:get_config` resolves the `config` account address from a fixture file
> (`testnet.json` unless `--devnet` is passed) rather than deriving it fresh for the
> network in play. `testnet.json` is NOT committed (it's gitignored), so on a fresh
> clone `yarn dawn:get_config --mainnet` errors because the fixture file is absent —
> and even when present, it holds testnet/devnet PDAs, not mainnet ones. `devnet.json`
> IS committed, so `yarn dawn:get_config --devnet` works in the dry-run (§8). If this
> command errors or prints stale PDAs, don't treat that as a failed deployment by
> itself — cross-check with the independent PDA derivation and on-chain account checks
> below, which are authoritative.

As an independent check, derive the `config` PDA directly from the program ID and fetch
it via `solana account`:

```bash
node -e "
const { PublicKey } = require('@solana/web3.js');
const programId = new PublicKey('<NEW_ID>');
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
const [dawnMintPda] = PublicKey.findProgramAddressSync([Buffer.from('dawn')], programId);
console.log({ configPda: configPda.toBase58(), dawnMintPda: dawnMintPda.toBase58() });
"

solana account <configPda-from-above> --url mainnet-beta
```

Note this only confirms the `config` account *exists* at the derived address (i.e. that
Proposal B was executed) — `solana account` dumps raw undecoded bytes, so it will not
show `authority` or `api_authority` as readable pubkeys without manually decoding the
account layout at the right byte offsets. In practice, the Squads UI showing the
proposal as "Executed" is the more useful independent success signal.

### 7.2 Token supply and metadata

Confirm the vault's DAWN ATA holds the full 1,000,000,000 DAWN supply. This uses the
`spl-token` CLI (install with `cargo install spl-token-cli` if you don't already have
it — it isn't part of the Agave install in §1.2):

```bash
spl-token accounts --owner <vault_pda> --url mainnet-beta
```

or, without installing anything, check the vault address on a Solana explorer (e.g. Solscan / Solana Explorer,
network = mainnet-beta) and confirm:
- a DAWN token balance of 1,000,000,000, and
- the DAWN mint shows metadata (name/symbol/URI) — i.e. `init_metadata` in Proposal B
  executed successfully.

---

## 8. Devnet dry-run

**Run this entire flow on devnet first** before attempting it on mainnet. It reuses the
same phases as §§1–7, but the devnet flow differs enough in tooling (multisig created by
this repo's script instead of the Squads web UI, airdropped SOL instead of a real
funding source, no real USDC) that it's spelled out below as its own complete, ordered,
copy-pasteable sequence. A fresh operator can run this section start to finish using
only this doc and the repo.

1. **Devtooling** (§1): install Rust, the Agave/Solana CLI, Anchor via avm, Node.js +
   Yarn, then install repo dependencies:

   ```bash
   yarn install
   ```

2. **Generate a devnet vanity keypair and replace the devnet placeholder id** (§2.1,
   devnet variant):

   ```bash
   solana-keygen grind --starts-with dawn:1
   ```

   Back the resulting `<PUBKEY>.json` up to 1Password immediately (same rationale as
   mainnet — see §9). Then replace the devnet placeholder id in both source files with
   the ground pubkey (basename of the `.json` without the extension):

   ```bash
   yarn dawn:deploy:set-program-id --devnet <NEW_ID>
   ```

3. **Fund the deployer wallet** with devnet SOL. This is `~/.config/solana/id.json` by
   default — it pays for the multisig creation (step 4), the proposal-creation
   transactions (step 8), and doubles as the devnet `<hot-wallet>` for the deploy itself
   (step 6):

   ```bash
   solana airdrop 2 --url devnet
   # repeat if you hit the per-request cap or need more (deploy + multisig + proposals
   # together cost a small fraction of a SOL, but airdrops are rate-limited)
   solana airdrop 2 --url devnet
   ```

4. **Create the multisig** (§2.2, devnet variant):

   ```bash
   yarn dawn:deploy:create-multisig --devnet
   ```

   Record the printed `MULTISIG ADDRESS` as `<multisig>` and `VAULT PDA (idx 0)` as
   `<vault_pda>`. This is a 1-of-1 multisig (the deployer wallet is the sole member) —
   use `--members`/`--threshold` if you want to test a multi-member flow instead.

5. **Fund the vault PDA** (§2.4, devnet variant) so it can pay rent for the accounts
   Phase 3's proposals create:

   ```bash
   solana transfer <vault_pda> 0.1 --allow-unfunded-recipient --url devnet
   ```

6. **Build and deploy** (§3, devnet variant):

   ```bash
   anchor build -- --features devnet

   solana program deploy target/deploy/dawn.so \
     --program-id <NEW_ID>.json \
     --url devnet
   ```

   (`<NEW_ID>.json` here is the keypair file itself, in whatever directory you left it
   — the one you ground in step 2, still sitting in your working directory unless you
   moved it.)

   With no `--keypair` passed, `solana program deploy` defaults to the client keypair
   (`~/.config/solana/id.json`) as fee-payer and initial upgrade authority — i.e. the
   same deployer wallet funded in step 3. Pass `--keypair <hot-wallet>` explicitly if
   you're using a separate devnet hot wallet.

7. **Transfer upgrade authority to the vault** (§4, devnet variant):

   ```bash
   solana program set-upgrade-authority <NEW_ID> \
     --new-upgrade-authority <vault_pda> \
     --skip-new-upgrade-authority-signer-check \
     --url devnet
   ```

   `--skip-new-upgrade-authority-signer-check` is required because the new authority is
   the vault PDA (no private key, can't co-sign); the current authority (your default
   `~/.config/solana/id.json`) still signs.

8. **Create the proposals** (§5, devnet variant):

   ```bash
   yarn dawn:deploy:token-proposal --devnet --multisig <multisig>

   yarn dawn:deploy:config-proposal --devnet --multisig <multisig> \
     --stable-mint <devnet-stable-mint>
   ```

   Mainnet USDC does not exist on devnet, so the config proposal's default
   `--stable-mint` (mainnet USDC's address) is wrong here — pass a real devnet mint. If
   you don't have one handy, create a throwaway with the `spl-token` CLI (install with
   `cargo install spl-token-cli` if needed — see §7.2):

   ```bash
   spl-token create-token --url devnet
   # use the printed mint address as <devnet-stable-mint> above
   ```

9. **Approve and execute both proposals** (§6, devnet variant) in the devnet Squads UI
   at [backup.app.squads.so](https://backup.app.squads.so): connect the deployer wallet,
   open `<multisig>`, and — since it's a 1-of-1 — approve then execute each proposal
   yourself. **Execute Proposal A (token init) before Proposal B (config + metadata)** —
   same ordering requirement as mainnet (§6).

10. **Verify** (§7, devnet variant):

    ```bash
    yarn dawn:get_config --devnet
    ```

    Confirm `authority` equals `<vault_pda>`. Then confirm the vault's DAWN ATA holds
    the full 1,000,000,000 DAWN supply:

    ```bash
    spl-token accounts --owner <vault_pda> --url devnet
    ```

Only proceed to the real mainnet run once this devnet dry-run's verification step
passes cleanly.

---

## 9. Custody note

The `<NEW_ID>.json` **program keypair is a deploy secret** — and, unlike a hot wallet,
it is irreplaceable: it's not just an authority you can rotate, it *is* the program's
on-chain identity (`<NEW_ID>` itself is derived from it). Anyone holding it can deploy
arbitrary code to `<NEW_ID>` for as long as that keypair (or a wallet it authorized)
retains upgrade authority, and if it is lost, `<NEW_ID>` can never be redeployed or
upgraded again by anyone. Specifically:

- **Back it up to 1Password (or your organization's secrets manager) immediately after
  grinding it in §2.1** — before the build, before the deploy, before anything else.
  This is the single most important step in this entire runbook to get right; every
  other mistake in this doc is recoverable, this one is not.
- It is **never** committed to this repository, any fork of it, or any CI system. It's
  covered by `.gitignore` (`/dawn**.json`), but don't rely on that alone — double-check
  `git status` before any commit while this file is in the working tree.
- Store the working copy in a secrets manager, hardware wallet, or offline encrypted
  medium — not in plaintext on a machine with network access, once Phase 1 (§3) is done.
- Once Phase 2 (§4) completes and upgrade authority has been transferred to
  `<vault_pda>`, the program keypair is no longer required for day-to-day operations
  (all further program upgrades happen only via Squads proposals). At that point,
  archive or destroy the working copy according to your organization's key-custody
  policy — do not leave it on any machine used for routine deploys. The 1Password (or
  equivalent) backup should still be retained indefinitely, in case the program ever
  needs to be redeployed from scratch at the same address.
- The hot wallet (`<hot-wallet>`) should also be treated as sensitive until Phase 2
  completes, since it holds upgrade authority in the window between Phase 1 and Phase 2
  — but unlike the program keypair, it is just an authority and can be rotated or
  replaced if lost.
