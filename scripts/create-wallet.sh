#!/usr/bin/env bash

# Script to create numbered Solana wallets in custom-wallets directory
# Usage: ./scripts/create-wallet.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAWN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WALLETS_DIR="$DAWN_DIR/custom-wallets"

# Create custom-wallets directory if it doesn't exist
mkdir -p "$WALLETS_DIR"

# Find the highest numbered wallet
highest_num=0
for wallet_file in "$WALLETS_DIR"/wallet-*.json; do
    if [ -f "$wallet_file" ]; then
        # Extract number from filename (wallet-N.json)
        num=$(basename "$wallet_file" | sed -n 's/wallet-\([0-9]*\)\.json/\1/p')
        if [ -n "$num" ] && [ "$num" -gt "$highest_num" ]; then
            highest_num=$num
        fi
    fi
done

# Calculate next wallet number
next_num=$((highest_num + 1))
wallet_path="$WALLETS_DIR/wallet-$next_num.json"

# Create the new wallet
echo "Creating wallet-$next_num.json in custom-wallets directory..."
solana-keygen new --outfile "$wallet_path" --no-bip39-passphrase

public_key=$(solana-keygen pubkey "$wallet_path")
echo
echo "Wallet created successfully: $wallet_path"
echo "Public key: $public_key"

# Airdrop 1000 SOL to the new wallet
echo
solana airdrop --keypair "$wallet_path" --url l 1000

echo
echo "Airdrop completed!"
echo "Now you can use it with --wallet flag: yarn dawn:add_device --wallet wallet-$next_num.json"