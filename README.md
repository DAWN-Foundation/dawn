# DAWN Programs

Solana smart contracts for the DAWN protocol

## Programs

- [Dawn Protocol](./programs/dawn/README.md)

## Prerequisites

- Node.js [(setup)](https://nodejs.org/en/download/)
- Yarn ([setup](https://yarnpkg.com/getting-started/install))
- Rust (see below or [setup](https://rust-lang.org/tools/install))
- Solana CLI (see below or [setup](https://solana.com/docs/intro/installation))
- Anchor (see below or [setup](https://www.anchor-lang.com/docs/installation))

## Setup

### Rust

```bash
# Install Rust (rustup is an official toolcaain installer for Rust)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add rustc and cargo to your PATH
. "$HOME/.cargo/env"

# Make sure Rust is installed
rustc --version
```

### Solana CLI

```bash
# Install the Solana CLI (version 1.17.0)
sh -c "$(curl -sSfL https://release.solana.com/v1.17.0/install)"

# Alternatively, install the latest Solana CLI (not recommended)
# sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

# Output might ask to:
# Close and reopen your terminal to apply the PATH changes

# Make sure Solana CLI is installed
solana --version
```

### Anchor

```bash
# Install Anchor Version Manager (AVM)
cargo install --git https://github.com/coral-xyz/anchor avm --force

# Make sure AVM is installed
avm --version

# Install the Anchor version 0.29.0
avm install 0.29.0

# Use the installed Anchor version
avm use 0.29.0

# Make sure Anchor is installed
anchor --version
```

### Local Keypair

```bash
# Generate a new keypair
# default location: ~/.config/solana/id.json
solana-keygen new

# [Optionally] Specify a custom location for the keypair
solana-keygen new --outfile ~/.config/solana/id.json

# Check the keypair public key
solana address --keypair ~/.config/solana/id.json

```

### Build

```bash
# Build the program
anchor build
```

### Local Program Address

Each local keypair is unique and must be set correctly to deploy contracts locally

```bash
# Check local program address
anchor keys list

# Sync local program address
anchor keys sync

# Build again
anchor build
```

### Unit testing

```bash
# Run the tests
anchor test
```

### Run local validator

```bash
# Start local validator (with cloned Raydium)
solana-test-validator \
  --reset \
  --bpf-program CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C raydium/raydium.so \
  --account DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8 raydium/pool_fee_receiver.json \
  --account D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2 raydium/raydium_config.json

# omit the --reset flag to keep existing data

# Airdrop 500 SOL to specified address
solana airdrop --url l 500 <address>
```

### Deploy

```bash
# Deploy the program locally
anchor deploy --provider.cluster l

# [Optional] If required to import the IDL somewhere
# Copy the IDL of the deployed program to the clipboard
# where `~/andrena/dawn` points to the project directory
pbcopy < ~/andrena/dawn/target/idl/dawn.json
```

### Testnet Setup

```bash
# Run the testnet script
yarn testnet
```

### Local Testnet

These command allow interaction with the plan contract deployed on local testnet

```bash
# Initialize the plan contract (as local identity )
yarn dawn:init

# [Optional] Its also possible to specify following signers
# apart from default one located at ~/.config/solana/id.json
# these can be applied to all transaction commands below
# for example:
# --root was used to mint tokens, might be used for init, but not necessary
# --service-provider is usually used to add a device and create plans
# --customer should have some USDC and can be used to pay for plan subscription
yarn dawn:init --root
yarn dawn:add_device --service-provider
yarn dawn:subscribe --customer

# Add a devices to the plan contract
yarn dawn:add_devices

# Add a device to the plan contract (as --service-provider)
yarn dawn:add_device \
    --service-provider \
    --manufacturer 'MikroTik' \
    --model 'GG69420' \
    --latitude '0.0000000001' \
    --longitude '0.0000000001' \

# Get all devices
yarn dawn:get_devices

# Get all devices for a specific owner
yarn dawn:get_devices --owner <owner>

# Create a plan for a device (as --service-provider)
yarn dawn:add_plan \
    --service-provider \
    --device <device> \
    --price 100000000 \
    --duration 30 \
    --speed 100 \
    --capacity 1000 \
    --sla 1

# Get all plans
yarn dawn:get_plans

# Get all plans for a specific devices
yarn dawn:get_plans --device <device>

# Mint USDC
yarn mint:usdc \
    --recipient <recipient> \
    --amount 240

# Subscribe to a plan (as --customer)
yarn dawn:subscribe \
    --customer \
    --plan <plan>

# Get all subscriptions
yarn dawn:get_subscriptions

# Get all subscriptions for a specific plan
yarn dawn:get_subscriptions --plan <plan>

# Get all subscriptions for a specific subscriber
yarn dawn:get_subscriptions --subscriber <subscriber>

# Claim locked DAWN after 24 hours (as --service-provider)
yarn dawn:claim \
    --service-provider \
    --subscription <subscription>
```
