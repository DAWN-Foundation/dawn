#!/usr/bin/env bash
#
# Regenerate the Anchor IDL for the lean access-domain program.
#
# Why this script exists:
#   Anchor 0.31.1's IDL extractor calls `proc_macro2::Span::local_file()`
#   which is only available on nightly rustc with the
#   `procmacro2_semver_exempt` cfg flag. The SBF program build itself is
#   fine on stable, but `anchor idl build` is not. We work around this
#   by spawning the IDL extraction under nightly without changing the
#   project's pinned 1.87 toolchain.
#
# Output:
#   idl/dawn-devnet.json   (committed; what the bridge / SDK consume)
#   idl/dawn-localnet.json (committed; for local validator runs)
#   target/idl/dawn.json   (transient, gitignored, last build)
#
# Usage:
#   ./scripts/build-idl.sh             # regenerates both cluster IDLs
#   ./scripts/build-idl.sh devnet      # devnet only
#   ./scripts/build-idl.sh localnet    # localnet only

set -euo pipefail

cd "$(dirname "$0")/.."

# Ensure nightly is installed.
if ! rustup toolchain list | grep -q '^nightly'; then
  echo "==> installing nightly toolchain (one-time)"
  rustup install nightly --component rust-src
fi

mkdir -p idl target/idl

build_one() {
  local cluster="$1"
  local cargo_args=()
  local out="idl/dawn-${cluster}.json"

  case "$cluster" in
    devnet)   cargo_args+=( --features devnet ) ;;
    localnet) ;;  # default declare_id! resolves to localnet
    *) echo "unknown cluster: $cluster" >&2; exit 1 ;;
  esac

  echo "==> building IDL ($cluster)"
  if [[ ${#cargo_args[@]} -gt 0 ]]; then
    RUSTUP_TOOLCHAIN=nightly \
      RUSTFLAGS="--cfg procmacro2_semver_exempt" \
      anchor idl build --out "$out" -- "${cargo_args[@]}"
  else
    RUSTUP_TOOLCHAIN=nightly \
      RUSTFLAGS="--cfg procmacro2_semver_exempt" \
      anchor idl build --out "$out"
  fi

  local addr
  addr=$(node -e "console.log(require('./$out').address)")
  echo "    address: $addr"
  echo "    bytes:   $(stat -f%z "$out" 2>/dev/null || stat -c%s "$out")"
}

case "${1:-all}" in
  devnet)   build_one devnet ;;
  localnet) build_one localnet ;;
  all)      build_one devnet; build_one localnet ;;
  *) echo "usage: $0 [devnet|localnet|all]" >&2; exit 1 ;;
esac

echo
echo "==> done"
ls -la idl/
