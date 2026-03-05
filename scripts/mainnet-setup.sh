#!/usr/bin/env bash

# Build the program for Mainnet
anchor build -- --features mainnet

# # Wallet (~/.config/solana/id.json) must have at least 10 SOL

# # Deploy the program to Mainnet with fixture keypair
anchor deploy --provider.cluster mainnet --program-name dawn --program-keypair TBD.json

# # Run the mainnet script (this takes a while)
# yarn mainnet

# # Run the config instruction
# yarn dawn:config --mainnet

# # Initialize the DAWN token metadata
# yarn dawn:init_metadata --devnet

# # Add a device model
# yarn dawn:add_device_model --devnet \
#     --device-type 'router' \
#     --manufacturer 'DAWN' \
#     --model 'Black Box'

# # Add default service agreement
# yarn dawn:add_service_agreement --devnet

# # Initialize IPAM
# yarn dawn:init_ipam --devnet
