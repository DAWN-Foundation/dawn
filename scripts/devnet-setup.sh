#!/usr/bin/env bash

# Build the program for Devnet
anchor build -- --features devnet

# # Wallet (~/.config/solana/id.json) must have at least 10 SOL

# # Deploy the program to Devnet with fixture keypair
anchor deploy --provider.cluster devnet --program-name dawn --program-keypair dawnt36j2ej84PXrEjrxDjmQb5nAAqCVwTP8f1Y1aYu.json

# Run the testnet script (this takes a while)
yarn devnet

# Run the config instruction
yarn dawn:config --devnet

# Initialize the DAWN token metadata
yarn dawn:init_metadata --devnet

# Add a device model
yarn dawn:add_device_model --devnet \
    --device-type 'router' \
    --manufacturer 'DAWN' \
    --model 'Black Box'

# Add default service agreement
yarn dawn:add_service_agreement --devnet

# Initialize IPAM
yarn dawn:init_ipam --devnet
