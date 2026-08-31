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
| `dawnC74…` | Shorthand for the mainnet program ID `dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP` (see `Anchor.toml`). |

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

### 2.1 Obtain the program keypair (out of band)

The mainnet program ID is fixed in `Anchor.toml`:

```toml
[programs.mainnet]
dawn = "dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP"
```

Deploying to this address requires the matching **program keypair file**
(`dawnC74….json`) — the private key that owns this program ID. This file is a deploy
secret and is **never committed to this repository**. Obtain it out of band from
whoever controls the DAWN program identity (secure transfer channel, hardware wallet
export, etc.), and store it somewhere outside the repo working tree, e.g.:

```bash
~/secrets/dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP.json
```

Treat this file with the same care as any private key that can overwrite a mainnet
program's code — see the Custody Note (§9) at the end of this document.

### 2.2 Create the Squads v4 multisig

1. Go to [app.squads.so](https://app.squads.so) and connect a wallet on **mainnet**.
2. Create a new multisig (Squads Protocol v4):
   - Add the member public keys who will approve deployments.
   - Set an approval threshold (e.g. 2-of-3).
3. Confirm creation and copy the **multisig account address**. This is `<multisig>`
   for every command below.

### 2.3 Derive the vault PDA

The Squads vault (index 0) is the account that will hold upgrade authority over the
program and `config.authority`/`api_authority` over the DAWN protocol config. Derive it
locally with the `@sqds/multisig` SDK already installed by `yarn install`:

```bash
node -e "
const m = require('@sqds/multisig');
const { PublicKey } = require('@solana/web3.js');
const multisigPda = new PublicKey('<multisig>');
const [vaultPda] = m.getVaultPda({ multisigPda, index: 0 });
console.log(vaultPda.toBase58());
"
```

Record the printed address as `<vault_pda>`. It should also be visible in the Squads UI
as the multisig's "Vault 1" address.

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

Deploy the built binary to the `dawnC74…` program ID, paid for and signed by the hot
wallet:

```bash
solana program deploy target/deploy/dawn.so \
  --program-id <path-to>/dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP.json \
  --keypair <hot-wallet> \
  --url mainnet-beta
```

Note the two different keys in this command:
- `--program-id` takes the **program keypair file** from §2.1 (the deploy secret that
  proves ownership of `dawnC74…`).
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
solana program set-upgrade-authority dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP \
  --new-upgrade-authority <vault_pda> \
  --keypair <hot-wallet> \
  --url mainnet-beta
```

After this, the hot wallet can no longer upgrade the program — only a Squads proposal
executed through `<multisig>` can. Verify:

```bash
solana program show dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP --url mainnet-beta
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
const programId = new PublicKey('dawnC74ugJiaQsLgRUfaTiWDmJpNq9cXo3E1NgdqwjP');
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

**Run this entire flow on devnet first** before attempting it on mainnet. It is the same
steps, with three changes: add `--devnet` to every CLI command, use a devnet Squads
multisig, and pass a real devnet stable mint (mainnet USDC does not exist on devnet).

1. **Devtooling**: same as §1.
2. **Program keypair**: the devnet program ID is also a fixed, vanity address
   (`dawnt36j2ej84PXrEjrxDjmQb5nAAqCVwTP8f1Y1aYu`, from `Anchor.toml`) — it needs its
   own matching keypair file, obtained the same way as §2.1 (lower stakes than the
   mainnet key, but still don't commit it).
3. **Build**: `anchor build -- --features devnet` instead of `--features mainnet`. This
   bakes the devnet program ID into `target/deploy`, `target/idl/dawn.json`, and
   `target/types/dawn.ts`.
4. **Deploy** (§3) and **transfer upgrade authority** (§4), using `--url devnet` and a
   funded devnet hot wallet (`solana airdrop` works on devnet).
5. **Multisig**: create a separate Squads v4 multisig at app.squads.so with your wallet
   connected to devnet (Squads supports devnet); derive its vault PDA the same way
   (§2.3).
6. **Proposals** (§5):

   ```bash
   yarn dawn:deploy:token-proposal --devnet --multisig <devnet-multisig>
   yarn dawn:deploy:config-proposal --devnet --multisig <devnet-multisig> \
     --stable-mint <devnet-stable-mint>
   ```

   `<devnet-stable-mint>` must be a mint that actually exists on devnet — e.g. one you
   create yourself (`spl-token create-token --url devnet`) or a known devnet USDC-Dev
   mint. It cannot be the mainnet USDC address used as the default.
7. **Approve/execute** (§6) in the Squads UI, connected to devnet.
8. **Verify** (§7), replacing `--mainnet` with `--devnet` and `--url mainnet-beta` with
   `--url devnet` throughout.

Only proceed to the real mainnet run once the devnet dry-run's Phase 5 verification
passes cleanly.

---

## 9. Custody note

The `dawnC74….json` **program keypair is a deploy secret**. Anyone holding it can deploy
arbitrary code to the `dawnC74…` program ID for as long as that keypair (or a wallet it
authorized) retains upgrade authority. Specifically:

- It is **never** committed to this repository, any fork of it, or any CI system.
- Store it in a secrets manager, hardware wallet, or offline encrypted medium — not in
  plaintext on a machine with network access, once Phase 1 (§3) is done.
- Once Phase 2 (§4) completes and upgrade authority has been transferred to
  `<vault_pda>`, the program keypair is no longer required for day-to-day operations
  (all further program upgrades happen only via Squads proposals). At that point,
  archive or destroy the working copy according to your organization's key-custody
  policy — do not leave it on any machine used for routine deploys.
- The hot wallet (`<hot-wallet>`) should also be treated as sensitive until Phase 2
  completes, since it holds upgrade authority in the window between Phase 1 and Phase 2.
