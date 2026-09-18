# DAWN Verified Build — Upgrade Runbook (one-time)

Step-by-step instructions for the operator performing the verified-build upgrade of the
DAWN mainnet program. Everything here is run from **one funded wallet** on your own
machine; nothing in this document requires access to the multisig.

The program's upgrade authority is a Squads v4 multisig, so you cannot upgrade the
program yourself. Your job is to produce and hand over two things — a **buffer account**
holding the reproducible binary, and a **base58 transaction** recording the build — and
the multisig members approve and execute each one. Steps marked **⏸ Multisig** are
checkpoints where you wait for them.

## Fixed values

| | |
|---|---|
| Program id | `DawnxS4Adzh591GmqiDNfrSZBS4ENdQ9VDRStRJJ8qt7` |
| Program data account | `7jpkbR8h2yn3Hxh3xzr2m48ioRMskz2JoLCd6AftF6W` |
| Upgrade authority (Squads vault) | `HYk9vvf2T1pYExtcxGTp6xt5B116vAFevX4VECWrx45U` |
| Repository | `https://github.com/DAWN-Foundation/dawn` |
| Commit to build | `752c885dc6ea41dce46eec1343380ff6806f2502` |
| Expected build hash | `00a10a10d55056c7c3b4325ea482ce68056abb147cf54c0a7daa793e826de04f` |
| Hash deployed today | `df53b8fd5abfe707a50de8c7538481f9162deca36bb8e3adef74d40f120e965d` |

The two hashes differ because the deployed binary was produced by a local `anchor build`,
which is not reproducible. This upgrade replaces it with the Docker-built binary, after
which anyone can rebuild the exact on-chain bytes from the commit above.

## What it costs

Fund the wallet with **~2.6 SOL** before you start:

| | |
|---|---|
| Buffer rent (465,421 bytes) | 2.365 SOL |
| Extending the program account (+20,000 bytes) | 0.101 SOL |
| Transaction fees | negligible |

The buffer rent is refunded when the upgrade executes — but it goes to the *spill
account* chosen by whoever creates the upgrade in Squads, which is normally the vault,
not you. **Agree reimbursement with the DAWN team before you start.** The 0.101 SOL for
the account extension is spent permanently either way.

---

## 1. Install the toolchain

```bash
# Rust (stable)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
. "$HOME/.cargo/env"

# Agave (Solana) CLI
sh -c "$(curl -sSfL https://release.anza.xyz/v3.1.14/install)"
solana --version

# solana-verify
cargo +stable install solana-verify --locked
solana-verify --version   # 0.5.1 or newer
```

Docker must also be installed **and running** — the build happens inside a container.

Two things that bite here:

- Install `solana-verify` from a directory *outside* the cloned repo, or with `+stable`
  as shown. The repo pins Rust 1.87.0 via `rust-toolchain.toml` and solana-verify needs
  1.89 or newer; running the install inside the clone picks up the pin and fails with
  `rustc 1.87.0 is not supported by the following packages`.
- Every command below passes `--url mainnet-beta` (or `-u`) explicitly. Don't rely on
  your Solana CLI config — if it points at localhost, commands fail with a bare
  `fetch failed` or a connection error rather than anything useful.

## 2. Clone the repository at the exact commit

```bash
git clone https://github.com/DAWN-Foundation/dawn.git
cd dawn
git checkout 752c885dc6ea41dce46eec1343380ff6806f2502
```

## 3. Build the program reproducibly and check the hash

```bash
solana-verify build --library-name dawn -- --features mainnet
```

This takes 10–20 minutes on a first run; it compiles the whole dependency tree inside
`solanafoundation/solana-verifiable-build`. The image version (v2.3.0) is derived from
`Cargo.lock`, so don't pass `--base-image`.

`--features mainnet` is required — it selects the mainnet `declare_id!`. Without it you
build a different program.

```bash
solana-verify get-executable-hash target/deploy/dawn.so
```

**This must print `00a10a10d55056c7c3b4325ea482ce68056abb147cf54c0a7daa793e826de04f`.**
If it prints anything else, stop and report it — do not continue. A different hash means
your build environment differs from the one the DAWN team used, and uploading it would
put unverifiable bytes on-chain.

## 4. Extend the program account

The new binary is 465,384 bytes; the deployed program account only has room for 445,592.
Without this step the upgrade fails when the multisig executes it.

```bash
solana program extend DawnxS4Adzh591GmqiDNfrSZBS4ENdQ9VDRStRJJ8qt7 20000 \
  --url mainnet-beta \
  --keypair <your-wallet.json>
```

This is permissionless — it needs no authority, only a payer. Cost: 0.101 SOL,
not refundable.

## 5. Upload the buffer

Generate a buffer keypair first. It costs nothing and makes the upload restartable —
a 465 KB upload is hundreds of transactions and a dropped connection partway through is
common:

```bash
solana-keygen new --no-bip39-passphrase -o buffer.json

solana program write-buffer target/deploy/dawn.so \
  --buffer buffer.json \
  --url mainnet-beta \
  --keypair <your-wallet.json>
```

It prints `Buffer: <buffer-address>`. Record it.

If the upload dies partway, re-run the identical command: because `--buffer` names a
fixed account, it continues writing into the same one. Without it, each attempt creates a
fresh buffer and strands your SOL in the abandoned one. To find and reclaim any stranded
buffers:

```bash
solana program show --buffers --buffer-authority <your-wallet-pubkey> --url mainnet-beta
solana program close <buffer-address> --url mainnet-beta --keypair <your-wallet.json>
```

Confirm the buffer holds exactly the bytes you built:

```bash
solana-verify get-buffer-hash <buffer-address> -u mainnet-beta
```

**Must print the same `00a10a10…` hash as step 3.** If it doesn't, close the buffer and
upload again.

## 6. Hand the buffer to the vault

```bash
solana program set-buffer-authority <buffer-address> \
  --new-buffer-authority HYk9vvf2T1pYExtcxGTp6xt5B116vAFevX4VECWrx45U \
  --url mainnet-beta \
  --keypair <your-wallet.json>
```

After this you can no longer write to the buffer or close it to reclaim the rent — only
the multisig can. Do it only once step 5's hash check has passed. Verify the handoff
landed:

```bash
solana program show --buffers --buffer-authority HYk9vvf2T1pYExtcxGTp6xt5B116vAFevX4VECWrx45U \
  --url mainnet-beta
```

**Report to the DAWN team: the buffer address, and the hash from step 5.**

## 7. ⏸ Multisig — the upgrade

A multisig member creates the program upgrade in the Squads UI against your buffer, the
members approve to threshold, and one of them executes it. Nothing for you to do but
wait. When they confirm it executed:

```bash
solana-verify get-program-hash DawnxS4Adzh591GmqiDNfrSZBS4ENdQ9VDRStRJJ8qt7 -u mainnet-beta
```

**Must now print `00a10a10…`** — the same hash as steps 3 and 5. The program is now
reproducible; it is not yet *marked* verified, which is what the rest of this document
does.

## 8. Build the verification transaction

This writes a PDA recording the repo, commit and build arguments. It must be signed by
the upgrade authority — the vault — so you build the transaction and the multisig signs
it:

```bash
solana-verify export-pda-tx https://github.com/DAWN-Foundation/dawn \
  --program-id DawnxS4Adzh591GmqiDNfrSZBS4ENdQ9VDRStRJJ8qt7 \
  --uploader HYk9vvf2T1pYExtcxGTp6xt5B116vAFevX4VECWrx45U \
  --commit-hash 752c885dc6ea41dce46eec1343380ff6806f2502 \
  --library-name dawn \
  --encoding base58 \
  --compute-unit-price 0 \
  -u mainnet-beta \
  -- --features mainnet
```

It clones the repo at that commit, prints `PDA does not exist, creating initialize
transaction`, and then prints one long base58 string.

**Send that entire base58 string to the DAWN team.** The arguments above must match step
3 exactly — same commit, same `--features mainnet` — because the remote builder replays
them.

## 9. ⏸ Multisig — the PDA write

A member imports your base58 string into the Squads transaction builder, checks that the
simulation touches only the otter-verify program and the compute budget program, and the
members approve and execute it. Wait for their confirmation.

## 10. Submit the verification job

Anyone can run this; it asks the OtterSec API to rebuild the program from the PDA's
metadata and compare against what's on-chain.

```bash
solana-verify remote submit-job \
  --program-id DawnxS4Adzh591GmqiDNfrSZBS4ENdQ9VDRStRJJ8qt7 \
  --uploader HYk9vvf2T1pYExtcxGTp6xt5B116vAFevX4VECWrx45U \
  -u mainnet-beta
```

It prints a job id. The remote build takes a while — it rebuilds from scratch in the same
container:

```bash
solana-verify remote get-job --job-id <job-id>
solana-verify remote get-status --program-id DawnxS4Adzh591GmqiDNfrSZBS4ENdQ9VDRStRJJ8qt7 -u mainnet-beta
```

When it succeeds, [Solscan](https://solscan.io/account/DawnxS4Adzh591GmqiDNfrSZBS4ENdQ9VDRStRJJ8qt7)
shows the program as verified, linked to commit `752c885`. **This is the finish line —
report it and you're done.**

---

## If something goes wrong

| Symptom | Cause |
|---|---|
| `fetch failed`, or a connection error on any command | Missing `--url mainnet-beta`; the Solana CLI config is pointing somewhere else. |
| 429 / rate-limit errors during `write-buffer` | The public RPC is throttling a 465 KB upload. Use a private RPC endpoint (Helius, Triton, QuickNode) for `--url`. |
| `rustc 1.87.0 is not supported` when installing solana-verify | You ran `cargo install` inside the clone. Run it elsewhere, or with `cargo +stable`. |
| Build hash ≠ `00a10a10…` | Wrong commit, missing `--features mainnet`, or `--base-image` was passed. Stop and report. |
| Upgrade fails on execution with an account-size error | Step 4 was skipped or the extension was too small. |
| `solana-verify` commands fail on a missing keypair | Some subcommands read the default keypair from the Solana CLI config even when they don't sign. Point `solana config set --keypair` at any valid keypair file. |
