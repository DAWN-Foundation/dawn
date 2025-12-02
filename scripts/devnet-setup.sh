#!/usr/bin/env bash

# Build the program for Devnet
anchor build -- --features devnet

# # Wallet (~/.config/solana/id.json) must have at least 10 SOL

# # Deploy the program to Devnet with fixture keypair
anchor deploy --provider.cluster devnet --program-name dawn --program-keypair dawnh7NAeRB3snhS5afN3JNzYVvUhgJpbNEBLxKwChv.json

# Run the testnet script (this takes a while)
yarn devnet

# Run the config instruction
yarn dawn:config --devnet

# Initialize the DAWN token metadata
yarn dawn:init_metadata --devnet
