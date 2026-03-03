#!/usr/bin/env bash

# Sync the program keypair before build (required by localnet)
./scripts/sync-testnet-program-id.sh

# Build the program
anchor build

# Airdrop 1000 SOL to specified address
solana airdrop --keypair ~/.config/solana/id.json --url l 1000

# Deploy the program locally
anchor deploy --provider.cluster l

# Run the testnet script (this takes a while)
yarn testnet

# Initialize the DAWN contract (as local identity)
yarn dawn:config

# Initialize the DAWN testnet flow
yarn dawn:init
