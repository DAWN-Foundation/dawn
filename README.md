# DAWN Programs

Solana smart contracts for the DAWN protocol

## Programs

- [Subscription Plan](./programs/plan/README.md)

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
# Install the Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

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

# Install the latest Anchor version
avm install latest

# Use latest Anchor version
avm use latest

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
# Build the IDL
anchor idl build --program-name plan

# Build the program
anchor build
```

### Unit testing

```bash
# Run the tests
anchor test
```

### Run local validator

```bash
# First run
solana-test-validator

# Subsequent runs
solana-test-validator --reset

# Airdrop 5 SOL to specified address
solana airdrop --url l 5 <address>
```

### Deploy

```bash
# Deploy the program locally
anchor deploy --provider.cluster l

# Copy the IDL of the deployed program to the clipboard
# where `~/andrena/dawn` points to the project directory
pbcopy < ~/andrena/dawn/target/idl/plan.json
```

### Testnet Setup

```bash
# Run the testnet script
yarn testnet
```
