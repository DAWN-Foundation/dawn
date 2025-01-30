#!/usr/bin/env bash

# Deploy the program locally
anchor deploy --provider.cluster l

# Run the testnet script (this takes a while)
yarn testnet

# Initialize the DAWN contract (as local identity)
yarn dawn:config

# Initialize the DAWN testnet flow
yarn dawn:init