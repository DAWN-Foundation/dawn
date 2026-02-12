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
# Install the Solana CLI (version 2.1.0)
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

# Install the Anchor version 0.31.1
avm install 0.31.1

# Use the installed Anchor version
avm use 0.31.1

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
# Use `dev` branch
git checkout dev

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
# Start local validator with script
make validator

# Or make this manualy 👇
# Start local validator (with cloned Raydium)
solana-test-validator \
  --reset \
  --bpf-program CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C raydium/raydium.so \
  --account DNXgeM9EiiaAbaWvwjHj9fQQLAX5ZsfHyvmYUNRAdNC8 raydium/pool_fee_receiver.json \
  --account D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2 raydium/raydium_config.json

# omit the --reset flag to keep existing data

# Airdrop 500 SOL to specified address
solana airdrop --keypair ~/.config/solana/id.json --url l 10000
```

### Deploy

```bash
# Deploy the program locally (if not use run-local-validator script)
anchor deploy --provider.cluster l

# [Optional] If required to import the IDL somewhere
# Copy the IDL of the deployed program to the clipboard
# where `~/andrena/dawn` points to the project directory
pbcopy < ~/andrena/dawn/target/idl/dawn.json
```

### Testnet Setup

```bash
# Run the init script
make setup
```

### Local Testnet

These command allow interaction with the DAWN contract deployed on local testnet

**Note on MEV Protection**: Subscribe and claim commands now include MEV sandwich attack protection. The CLI automatically calculates minimum DAWN output (`min_dawn_out`) and transaction deadline based on current pool state, accounting for Raydium's trade fees. You can control slippage tolerance using the `--slippage` flag (in basis points, default 100 = 1%).

```bash
# [Optional] Its also possible to specify following signers
# apart from default one located at ~/.config/solana/id.json
# these can be applied to all transaction commands below
# for example:
# empty means the local wallet is used and is usually the root wallet
# --service-provider is usually used to add a device and create plans
# --customer should have some USDC and can be used to pay for plan subscription
# yarn dawn:config
# yarn dawn:add_device_model
# yarn dawn:add_device --service-provider
# yarn dawn:add_plan --service-provider
# yarn dawn:subscribe --customer

# # Initialize the DAWN contract (as local identity)
# yarn dawn:config

# Add a device model (note Device Mode PDA from output)
yarn dawn:add_device_model \
    --manufacturer 'MikroTik' \
    --model 'GG69420'

# Add a device to the DAWN contract (as --service-provider)
yarn dawn:add_device \
    --service-provider \
    --device-model <device-model> \
    --latitude '37.774929' \
    --longitude '-122.419418'

# Add devices to the DAWN contract (--with-plans to generate and associate 1-3 random plans)
yarn dawn:add_devices \
    --service-provider \
    --device-model <device-model> \
    --count 10 \
    --with-plans

# Add a shared ip pool
yarn dawn:add_ip_pool

# Lease ip to device with device pda
yarn dawn:lease_ip --device <device>

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
# The CLI will automatically calculate MEV protection parameters
# Optional: --slippage <basis-points> (default 100 = 1%)
# Examples: --slippage 50 (0.5%), --slippage 300 (3%)
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
# Optional: --slippage <basis-points> (default 100 = 1%)
# Examples: --slippage 50 (0.5%), --slippage 300 (3%)
yarn dawn:claim \
    --service-provider \
    --subscription <subscription>
```

### MEV Protection & Slippage Settings

The DAWN protocol implements MEV sandwich attack protection for all swap operations (subscribe and claim). The CLI automatically:

1. Fetches current Raydium pool state
2. Calculates expected DAWN output based on pool reserves
3. Applies your slippage tolerance to set minimum acceptable output
4. Sets a 30-second transaction deadline

**Slippage Tolerance Guide:**

| Flag             | Percentage | Use Case                                 |
| ---------------- | ---------- | ---------------------------------------- |
| `--slippage 50`  | 0.5%       | Very stable market, tight MEV protection |
| `--slippage 100` | 1%         | **Default** - Standard MEV protection    |
| `--slippage 200` | 2%         | Normal conditions, moderate volatility   |
| `--slippage 300` | 3%         | Higher volatility tolerance              |
| `--slippage 500` | 5%         | Maximum allowed by program               |

**Note**: The CLI calculation reads Raydium's actual trade fee from the config account to match the program's validation exactly. Lower slippage values (0.5-1%) provide stronger MEV protection.

**Example with custom slippage:**

```bash
# Subscribe with 0.5% slippage (tighter MEV protection)
yarn dawn:subscribe --customer --plan <plan> --slippage 50

# Claim with 3% slippage (higher volatility tolerance)
yarn dawn:claim --service-provider --subscription <sub> --slippage 300

# Use default 1% slippage (recommended)
yarn dawn:subscribe --customer --plan <plan>
```

**Error Handling:**

- `TransactionExpired`: Deadline passed - retry transaction
- `InsufficientOutputAmount`: Price moved unfavorably - increase slippage or retry
- `UnrealisticMinimumOutput`: Calculated minOut exceeds 110% of expected - check pool state

For more details, see `CLI_MEV_PROTECTION_UPDATE.md`.

---

### Devnet Deployment

```bash
# Build the program with devnet feature
anchor build -- --features devnet

# Deploy the program to devnet
anchor deploy --provider.cluster devnet --program-name dawn --program-keypair dvwnCqTegp9rVZVTZgnfmpqgVCKD9PMF42f4yjTVPMJ.json
```
