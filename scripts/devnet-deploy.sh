#!/usr/bin/env bash
#
# Deploy the lean access-domain DAWN program to Solana devnet.
#
# This script is bound to the `access-domain-redesign` branch:
#   * Builds with `--features devnet` so declare_id! resolves to the
#     devnet program ID (see programs/dawn/src/lib.rs).
#   * Expects target/deploy/dawn-devnet-keypair.json whose pubkey equals
#     the value in Anchor.toml's [programs.devnet] block AND the
#     #[cfg(feature = "devnet")] declare_id! in lib.rs.
#
# Refusing to deploy from another branch is intentional: the older
# branches build the heavyweight (token + Raydium + IPAM) program, and
# pushing that under the lean program ID would replace the live program
# with an incompatible binary.
#
# Cost note: deploying a 532 KiB binary on devnet locks ~3.71 SOL of
# rent on the program-data account. Plan for ~4 SOL minimum, ~5 SOL
# comfortable.
#
# Override hooks:
#   ALLOW_BRANCH=1                 — skip the branch-name check
#   DEPLOYER_KEYPAIR=path/to.json  — use a non-default deployer keypair

set -euo pipefail

cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------
# Identity of THIS deploy
# ---------------------------------------------------------------------------
EXPECTED_BRANCH="access-domain-redesign"
EXPECTED_PROGRAM_ID="rHSumT63fgwAsHhKbR39AijjY28H99VuvM8xNaNehkj"
PROGRAM_KEYPAIR="target/deploy/dawn-devnet-keypair.json"
DEPLOYER_KEYPAIR="${DEPLOYER_KEYPAIR:-$HOME/.config/solana/id.json}"
BUILD_FEATURES="devnet"
CLUSTER="devnet"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_COMMIT=$(git rev-parse --short HEAD)
DIRTY=""
if ! git diff --quiet || ! git diff --cached --quiet; then
  DIRTY=" (DIRTY working tree)"
fi

cat <<EOF
─────────────────────────────────────────────────────────────────────
  DAWN devnet deploy
─────────────────────────────────────────────────────────────────────
  branch:      $CURRENT_BRANCH @ $CURRENT_COMMIT$DIRTY
  cluster:     $CLUSTER
  program id:  $EXPECTED_PROGRAM_ID
  features:    $BUILD_FEATURES
  program kp:  $PROGRAM_KEYPAIR
  deployer kp: $DEPLOYER_KEYPAIR
─────────────────────────────────────────────────────────────────────
EOF

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if [[ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" && -z "${ALLOW_BRANCH:-}" ]]; then
  cat >&2 <<EOF
ERROR: refusing to deploy.

  current branch: $CURRENT_BRANCH
  expected:       $EXPECTED_BRANCH

The lean access-domain program is only correct on '$EXPECTED_BRANCH'.
Other branches build a different program (token bootstrap + IPAM + plans)
that would clobber the live deploy under the same program ID.

If you really know what you are doing:
  ALLOW_BRANCH=1 ./scripts/devnet-deploy.sh
EOF
  exit 1
fi

[[ -f "$PROGRAM_KEYPAIR" ]] || {
  echo "ERROR: missing program keypair at $PROGRAM_KEYPAIR" >&2
  echo "       (the program-id keypair is gitignored; recover from your backup)" >&2
  exit 1
}
[[ -f "$DEPLOYER_KEYPAIR" ]] || {
  echo "ERROR: missing deployer keypair at $DEPLOYER_KEYPAIR" >&2
  exit 1
}

ACTUAL_PROGRAM_ID=$(solana-keygen pubkey "$PROGRAM_KEYPAIR")
if [[ "$ACTUAL_PROGRAM_ID" != "$EXPECTED_PROGRAM_ID" ]]; then
  cat >&2 <<EOF
ERROR: program keypair pubkey does not match the expected devnet ID.
  expected: $EXPECTED_PROGRAM_ID
  actual:   $ACTUAL_PROGRAM_ID
EOF
  exit 1
fi

# Cross-check Anchor.toml is in sync with the keypair.
ANCHOR_TOML_ID=$(awk '/^\[programs\.devnet\]/{f=1;next} f && /^dawn[[:space:]]*=/{gsub(/"/,"",$3); print $3; exit}' Anchor.toml)
if [[ "$ANCHOR_TOML_ID" != "$EXPECTED_PROGRAM_ID" ]]; then
  cat >&2 <<EOF
ERROR: Anchor.toml [programs.devnet] is out of sync.
  Anchor.toml: $ANCHOR_TOML_ID
  expected:    $EXPECTED_PROGRAM_ID
EOF
  exit 1
fi

DEPLOYER_PUBKEY=$(solana-keygen pubkey "$DEPLOYER_KEYPAIR")
echo "deployer pubkey: $DEPLOYER_PUBKEY"

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
echo
echo "==> building (cargo build-sbf --features $BUILD_FEATURES)"
cargo build-sbf --manifest-path programs/dawn/Cargo.toml --features "$BUILD_FEATURES"

BINARY="target/deploy/dawn.so"
SIZE=$(stat -f%z "$BINARY" 2>/dev/null || stat -c%s "$BINARY")
echo "==> binary: $BINARY ($SIZE bytes)"

# ---------------------------------------------------------------------------
# Cost / balance check
# ---------------------------------------------------------------------------
# Devnet rent-exempt threshold: ~6,960 lamports per byte. The BPF loader
# allocates exactly the binary's byte length for the program data account
# (no 2× upgrade-buffer overhead in practice — confirmed by observation
# at first deploy: 532,376 bytes → 3.71 SOL locked).
#
# Add 0.1 SOL of headroom for tx fees + future upgrade re-uploads.
NEEDED_LAMPORTS=$(( SIZE * 6960 + 100000000 ))
NEEDED_SOL=$(python3 -c "print(round(${NEEDED_LAMPORTS}/1e9, 3))")

BALANCE_LAMPORTS=$(solana balance --url "$CLUSTER" --keypair "$DEPLOYER_KEYPAIR" --lamports | awk '{print $1}')
BALANCE_SOL=$(python3 -c "print(round(${BALANCE_LAMPORTS}/1e9, 3))")

echo "==> deployer balance: $BALANCE_SOL SOL (deploy needs ≈ $NEEDED_SOL SOL)"

if (( BALANCE_LAMPORTS < NEEDED_LAMPORTS )); then
  cat >&2 <<EOF
ERROR: insufficient balance on $DEPLOYER_PUBKEY.
  balance: $BALANCE_SOL SOL
  needed:  $NEEDED_SOL SOL

Top up the deployer wallet on devnet and re-run. If the standard faucet
is rate-limited, mine SOL via:

    cargo install devnet-pow
    devnet-pow mine -d 3 --reward 0.02 --no-infer -t 3000000000 -u dev
EOF
  exit 1
fi

# ---------------------------------------------------------------------------
# Deploy
# ---------------------------------------------------------------------------
echo
echo "==> deploying to $CLUSTER"
anchor deploy \
  --provider.cluster "$CLUSTER" \
  --provider.wallet "$DEPLOYER_KEYPAIR" \
  --program-name dawn \
  --program-keypair "$PROGRAM_KEYPAIR"

echo
echo "==> verifying on-chain"
solana program show "$EXPECTED_PROGRAM_ID" --url "$CLUSTER"

cat <<EOF

─────────────────────────────────────────────────────────────────────
  Deployed.
  https://solscan.io/account/$EXPECTED_PROGRAM_ID?cluster=$CLUSTER
─────────────────────────────────────────────────────────────────────
EOF
