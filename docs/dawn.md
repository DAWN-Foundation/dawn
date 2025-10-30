# DAWN Protocol - Complete System Documentation

## Overview

DAWN Protocol is a decentralized wireless access network built on Solana, providing infrastructure for device management, hierarchical service plans, IP address management (IPAM), and authentication frameworks (AMF) for secure device connectivity.

## Project Structure

```
.
├── .cursor/rules/dawn-rules.mdc
├── Anchor.toml
├── Cargo.toml
├── cli/                          # CLI commands for protocol interaction
│   ├── commands/
│   │   ├── auth/                 # Authentication method management
│   │   ├── config/               # Protocol configuration
│   │   ├── devices/              # Device model and device management
│   │   ├── ipam/                 # IP address management
│   │   ├── plans/                # Service plans and agreements
│   │   ├── subscriptions/        # Subscription and claiming
│   │   └── utils/                # Utility commands
│   ├── environments/             # Network environment configs
│   └── shared/                   # Shared CLI utilities
├── migrations/                   # Deployment scripts
├── programs/dawn/                # Solana program (Rust)
│   └── src/
│       ├── lib.rs                # Main program entry point
│       ├── constants.rs          # System constants
│       ├── error.rs              # Error definitions
│       ├── events.rs             # Event definitions
│       ├── app/                  # Business logic modules
│       │   ├── amf/              # Authentication Method Framework
│       │   ├── claim.rs          # Token claiming
│       │   ├── device/           # Device management
│       │   ├── init_fee_accounts.rs
│       │   ├── init_token.rs
│       │   ├── initialize_config.rs
│       │   ├── ipam/             # IP Address Management
│       │   ├── plan/             # Plan management
│       │   ├── subscription/     # Subscription management
│       │   └── update_config.rs
│       ├── state/                # Account structures
│       │   ├── access_domain.rs
│       │   ├── auth_method.rs
│       │   ├── auth_method_type.rs
│       │   ├── config.rs
│       │   ├── connection.rs
│       │   ├── credential.rs
│       │   ├── device.rs
│       │   ├── device_location.rs
│       │   ├── device_model.rs
│       │   ├── distribution_domain.rs
│       │   ├── ip_block.rs
│       │   ├── ip_lease.rs
│       │   ├── ip_registry.rs
│       │   ├── ip_tier.rs
│       │   ├── local_domain.rs
│       │   ├── plan.rs
│       │   ├── root_ip_block.rs
│       │   ├── service_agreement.rs
│       │   ├── subscription.rs
│       │   └── token_config.rs
│       └── utils/                # Utility functions
├── raydium/                      # Raydium DEX integration
├── scripts/                      # Setup and deployment scripts
├── sdk/                          # TypeScript SDK
│   ├── client/                   # Client managers
│   ├── integrations/raydium/     # DEX integration
│   ├── pda/                      # PDA derivation functions
│   └── utils/                    # Helpers and types
└── tests/dawn/                   # Comprehensive test suite
    ├── 00_config.ts              # Config initialization
    ├── 01_device_model.ts        # Device models
    ├── 02_device.ts              # Device creation
    ├── 03_service_agreement.ts   # Service agreements
    ├── 04_plan.ts                # Plan creation (L3/L2)
    ├── 05_subscription.ts        # Subscriptions
    ├── 06_claim.ts               # Token claiming
    ├── 07_amf.ts                 # AMF authentication
    ├── 08_psk_amf.ts             # PSK authentication
    └── 09_ipam.ts                # IPAM operations
```

## Core Architecture

### 1. Protocol Configuration System

#### Config Account

**Purpose**: Central configuration for the protocol
**Seeds**: `["config"]`

**Fields**:

- `authority`: Protocol administrator
- `token_config`: Reference to TokenConfig account
- `usdc_mint`: USDC token mint
- `dawn_mint`: DAWN token mint
- Fee accounts: `fee_pool_dawn_account`, `dao_dawn_account`, `validator_dawn_account`, `medallion_dawn_account`
- Raydium integration: `raydium`, `raydium_authority`, `raydium_config`, `raydium_pool`, `raydium_observation`
- Fee percentages (BPS): `dao_fee`, `validator_fee`, `medallion_fee`

#### TokenConfig Account

**Purpose**: Manages DAWN token mint and fee distribution
**Seeds**: `["token"]`

**Fields**:

- `dawn_mint`: DAWN token mint address
- Bump seeds for: mint, fee pool, DAO, validator, medallion accounts

### 2. IP Address Management (IPAM)

The IPAM system uses a three-tier hierarchical structure with bitmap-based allocation for O(1) IP assignment.

#### Three-Tier System

**Subscriber Tier** (`IpTier::Subscriber = 0`)

- Purpose: End-user device addresses
- Unit: /32 (single IP)
- Capacity: 1024 units per block
- Range: Configurable (e.g., 10.64.0.0/10)

**Loopback Tier** (`IpTier::Loopback = 1`)

- Purpose: Device loopback addresses
- Unit: /32 (single IP)
- Capacity: 1024 units per block
- Range: Configurable (e.g., 100.64.0.0/11)

**PtP Tier** (`IpTier::PtP = 2`)

- Purpose: Point-to-point links between devices
- Unit: /31 (pair of IPs)
- Capacity: 512 pairs per block
- Range: Configurable (e.g., 100.96.0.0/11)

#### IPAM Hierarchy

```
IpRegistry (per tier)
    └── RootIpBlock (per sequence, configurable base_ipv4/base_cidr)
            └── IpBlock (on-demand, /22 = 1024 or 512 units)
                    └── IpLease (per device)
```

#### IpRegistry Account

**Purpose**: Registry tracking all root blocks for a tier
**Seeds**: `["ip_registry", tier]`

**Fields**:

- `tier`: IpTier enum (Subscriber/Loopback/PtP)
- `authority`: Manager of root blocks
- `root_block_count`: Number of root blocks
- `next_index`: Next sequence number
- `root_availability_bitmap`: Tracks which root blocks have capacity (64-bit bitmap)

#### RootIpBlock Account

**Purpose**: Manages a range of IP blocks within a tier
**Seeds**: `["root_ip_block", tier, index]`

**Fields**:

- `tier`: IpTier enum
- `authority`: Block manager
- `index`: Root block sequence number
- `base_ipv4`: Starting IPv4 address (u32)
- `base_cidr`: CIDR prefix for entire root block
- `block_cidr`: Fixed at /22 for sub-blocks
- `root_chunks`: Bitmap tracking block availability (Vec<u64>)
- `root_summary64`: Summary of chunk availability
- `first_available_block_idx`: Cached index for O(1) lookup

**Constants**:

- `BLOCK_CIDR`: /22 (constant)
- Max 256 root blocks per tier
- Bitmap tracks first 64 root blocks for availability

#### IpBlock Account

**Purpose**: Fixed-size block with bitmap allocation (created on-demand)
**Seeds**: `["ip_block", root_ip_block, block_index]`

**Fields**:

- `tier`: IpTier enum
- `root_block_index`: Parent root block
- `block_base`: Base IPv4 address (u32)
- `block_cidr`: /22
- `unit_capacity`: 1024 (/32) or 512 (/31)
- `free_units`: Current available count
- `slots_chunks`: Allocation bitmap (Vec<u64>, 16 or 8 chunks)
- `chunk_free_bitmap`: Quick lookup for free chunks (u16)

**Allocation Algorithm**:

1. Find first chunk with free space using `chunk_free_bitmap`
2. Find first free bit within chunk using `trailing_ones()`
3. Set bit to mark as allocated
4. Update `chunk_free_bitmap` if chunk becomes full
5. Decrement `free_units`

#### IpLease Account

**Purpose**: Records IP assignment to a device
**Seeds**: `["ip_lease", tier, device]`

**Fields**:

- `tier`: IpTier enum
- `device`: Device owner of this IP
- `ipv4`: Assigned IP address [u8; 4]
- `ip_v4_cidr_mask`: /32 or /31
- `block_index`: Index in root block
- `unit_index`: Index within block

### 3. Domain System

The domain system creates hierarchical namespaces for network organization.

#### LocalDomain Account

**Purpose**: Namespace created when user adds their first device
**Seeds**: `["local_domain", owner, name]`

**Fields**:

- `owner`: Domain owner
- `name`: Domain name (32 bytes fixed)

**Created**: Automatically on first device addition per owner

#### DistributionDomain Account

**Purpose**: Wholesale distribution domain for L3 plans
**Seeds**: `["distribution_domain", plan, local_domain]`

**Fields**:

- `owner`: Domain owner (same as L3 plan owner)
- `local_domain`: Associated local domain

**Created**: With L3 plans (original plans that can be resold)

#### AccessDomain Account

**Purpose**: Retail access domain for L2 plans
**Seeds**: `["access_domain", plan, local_domain]`

**Fields**:

- `owner`: Domain owner (same as L2 plan owner)
- `local_domain`: Associated local domain

**Created**: With L2 plans (resold plans derived from L3)

### 4. Device Management

#### DeviceModel Account

**Purpose**: Defines device types available in the network
**Seeds**: `["device_model", device_type, manufacturer, model]`

**Fields**:

- `device_type`: Router or WirelessRadio
- `manufacturer`: Brand name (max 64 chars)
- `model`: Model identifier (max 64 chars)

**Authority**: Protocol authority only

**DeviceType Enum**:

- `Router`: Routing device
- `WirelessRadio`: Wireless access point

#### Device Account

**Purpose**: Represents a physical device in the network
**Seeds**: `["device", owner, model, name, mac_address]`

**Fields**:

- `owner`: Device owner
- `model`: Reference to DeviceModel
- `name`: Device name (max 32 chars)
- `local_domain`: Associated LocalDomain
- `mac_address`: MAC address [u8; 6]

#### DeviceLocation Account

**Purpose**: Geographic and physical placement data
**Seeds**: `["device_location", device]`

**Fields**:

- `device`: Associated device
- `height`: Antenna height in meters (u16)
- `latitude`: Latitude coordinate (i64, scaled)
- `longitude`: Longitude coordinate (i64, scaled)
- `placement`: [azimuth, tilt] in centidegrees
  - `azimuth`: 0.00-360.00 (scaled by 100)
  - `tilt`: -90.00-90.00 (scaled by 100)
- `verified`: Authority verification flag
- `verified_at`: Verification timestamp

**Created**: Automatically with device
**Validation**:

- Height > 0
- Latitude != 0, Longitude != 0
- Azimuth: 0-36000 (0°-360°)
- Tilt: -9000-9000 (-90°-90°)

### 5. Plan System

Plans represent service offerings with two tiers: L3 (wholesale) and L2 (retail resale).

#### ServiceAgreement Account

**Purpose**: Defines service level agreement terms
**Seeds**: `["service_agreement", threshold, payout_ratio]`

**Fields**:

- `threshold`: Service threshold percentage
- `payout_ratio`: Payout distribution ratio

**Required**: Before creating any plan

#### Plan Account

**Purpose**: Service plan offering (L3 or L2)
**Seeds**: `["plan", local_domain, parent_plan?, name, price, duration, speed, capacity, start_at, service_agreement]`

**Fields**:

- `owner`: Plan creator
- `local_domain`: Associated LocalDomain
- `access_domain`: Set for L2 plans (Option<Pubkey>)
- `distribution_domain`: Set for L3 plans (Option<Pubkey>)
- `parent_plan`: Set for L2 plans (Option<Pubkey>)
- `name`: Plan name (max 32 chars)
- `price`: Price in USDC (6 decimals)
- `duration`: Duration in days (u16)
- `speed`: Speed in Mbps (u32)
- `capacity`: Data capacity in MB (u64, 0 = unlimited)
- `start_at`: Start timestamp (0 = immediate)
- `service_agreement`: Associated ServiceAgreement
- `auth_methods`: Authentication methods (max 2)

**L3 Plans (Original)**:

- Create DistributionDomain
- Can be resold as L2 plans
- Wholesale tier

**L2 Plans (Derived)**:

- Create AccessDomain
- Require parent L3 plan subscription
- Must stay within parent bounds:
  - `duration <= parent.duration`
  - `speed <= parent.speed`
  - `capacity <= parent.capacity`
- Retail tier

### 6. Subscription System

#### Subscription Account

**Purpose**: Active subscription to a plan
**Seeds**: `["subscription", plan, subscriber]`

**Fields**:

- `plan`: Associated Plan
- `subscriber`: Subscriber address
- `device`: Optional device (for fixed installations)
- `expiration`: Subscription end time (Unix timestamp)
- `last_claim`: Last DAWN token claim timestamp
- `claimable_dawn`: Accumulated DAWN tokens
- `daily_usdc`: Daily USDC portion for swaps

**Payment Flow**:

1. User pays USDC for plan
2. Fee distribution (DAO, validators, medallion pools)
3. Portion swapped to DAWN via Raydium
4. DAWN locked for 24h claiming period
5. Plan owner receives USDC in escrow
6. User can claim DAWN after 24h

### 7. Authentication Method Framework (AMF)

The AMF provides secure device authentication and connection management.

#### AuthMethodType Enum

- `Psk = 0`: Pre-Shared Key
- `Mpsk = 1`: Multi Pre-Shared Key
- `Eap = 2`: EAP-TLS/TTLS/PEAP
- `Ipsec = 3`: IPsec Authentication Header
- `Wpa2Enterprise = 4`: WPA2 Enterprise (802.1X)
- `Wpa3Enterprise = 5`: WPA3 Enterprise

#### AuthMethod Account

**Purpose**: Authentication method configuration for a device
**Seeds**: `["auth_method", authority, method_type, parameters[..32]]`

**Fields**:

- `authority`: Method owner
- `method_type`: AuthMethodType enum
- `device`: Associated device
- `parameters`: Method-specific config (256 bytes)

**PSK Parameters** (102 bytes):

- Security standard (WPA2/WPA3)
- Encryption algorithm (AES/TKIP)
- Rotation interval
- Network identifier (SSID)

**EAP Parameters** (138 bytes):

- RADIUS server address
- EAP type (TLS/TTLS/PEAP)
- Cipher suite
- Certificate fingerprint
- Fragment size
- Session timeout
- Identity settings

**IPsec Parameters**:

- Algorithm (AH/ESP)
- Key lifetime
- IPsec mode (Transport/Tunnel)
- DH group
- Replay window size

#### Credential Account

**Purpose**: Stores client authentication credentials
**Seeds**: `["credential", auth_method, client]`

**Fields**:

- `auth_method`: Associated AuthMethod
- `client`: Client device/user
- `credential_data`: Encrypted credentials (128 bytes)
- `active`: Activation status

#### Connection Account

**Purpose**: Records authenticated connections between entities
**Seeds**: `["connection", auth_method, entity_a, entity_b]`

**Fields**:

- `auth_method`: Authentication method used
- `entity_a`: First entity (e.g., device)
- `entity_b`: Second entity (e.g., client)
- `credential_data_a`: Entity A credentials (64 bytes)
- `credential_data_b`: Entity B credentials (64 bytes)
- `active`: Connection status

## Complete Business Flows

### Flow 1: Protocol Initialization

**Required Authority**: Protocol administrator

```
Step 1: Initialize Token System
  └── init_token()
      ├── Creates: TokenConfig account
      ├── Creates: DAWN mint (6 decimals)
      ├── Mints: 1B DAWN to caller
      └── Emits: TokenConfigInitialized

Step 2: Initialize Fee Accounts
  └── init_fee_accounts()
      ├── Creates: fee_pool_dawn_account
      ├── Creates: dao_dawn_account
      ├── Creates: validator_dawn_account
      └── Creates: medallion_dawn_account

Step 3: Initialize Configuration
  └── initialize_config(dao_fee, validator_fee, medallion_fee)
      ├── Creates: Config account
      ├── Sets: Fee percentages (BPS, max 10,000)
      ├── Validates: Total fees <= 100%
      ├── Links: TokenConfig, USDC mint, DAWN mint
      ├── Links: Fee distribution accounts
      └── Links: Raydium pool accounts for swaps

Step 4: Initialize IPAM Root Blocks (per tier)
  └── initialize_root_ip_block(tier, base_ipv4, base_cidr)
      ├── Creates: IpRegistry (if first for tier)
      ├── Creates: RootIpBlock with sequence number
      ├── Validates: IPv4 alignment and overflow
      ├── Registers: Root block in registry bitmap
      └── Emits: IpRegistryInitialized, RootIpBlockInitialized
```

### Flow 2: Device Management

**Step 1: Authority Adds Device Models**

```
add_device_model(device_type, manufacturer, model)
  ├── Authority: Protocol admin only
  ├── Creates: DeviceModel account
  ├── Types: Router or WirelessRadio
  └── Emits: DeviceModelAdded
```

**Step 2: User Adds Device**

```
add_device(name, height, lat, long, placement, mac, domain_name)
  ├── Creates: Device account
  ├── Creates: DeviceLocation account
  ├── Creates: LocalDomain (if first device for user)
  ├── Validates:
  │   ├── Height > 0
  │   ├── Latitude != 0, Longitude != 0
  │   ├── Azimuth: 0-36000 (0°-360°)
  │   └── Tilt: -9000-9000 (-90°-90°)
  ├── Links: Device to LocalDomain
  └── Emits: DeviceAdded, DeviceLocationAdded, LocalDomainAdded
```

**Step 3: Authority Verifies Location**

```
verify_device_location()
  ├── Authority: Protocol admin
  ├── Updates: DeviceLocation.verified = true
  └── Emits: DeviceLocationVerified
```

### Flow 3: IPAM Operations

**Initialization** (Authority)

```
initialize_root_ip_block(tier, base_ipv4, base_cidr)
  ├── Example: Subscriber tier, 10.64.0.0/10
  ├── Creates: IpRegistry + RootIpBlock
  ├── Validates: IPv4 range and alignment
  └── Capacity: Subdivided into /22 blocks on-demand
```

**Authority Allocation** (Loopback/PtP tiers)

```
allocate_ip(device, tier)
  ├── Authority: Root block authority
  ├── Tiers: Loopback or PtP only
  ├── Finds: First available root block
  ├── Creates: IpBlock on-demand (if needed)
  ├── Algorithm:
  │   ├── Check root block availability bitmap
  │   ├── Get first_available_block_idx
  │   ├── Initialize IpBlock if block_base == 0
  │   ├── Find first free unit using bitmap
  │   ├── Allocate unit: mark bit, update counters
  │   └── Update root block if IpBlock becomes full
  ├── Creates: IpLease to device
  └── Emits: IpBlockAdded (if new), IpLeased
```

**Subscriber Allocation** (Requires subscription)

```
lease_subscription_ip(device, subscription)
  ├── Caller: Device owner
  ├── Tier: Subscriber only
  ├── Validates: Active subscription (expiration > now)
  ├── Finds: Available root block from registry
  ├── Creates: IpBlock on-demand (if needed)
  ├── Allocates: First available /32 address
  ├── Creates: IpLease to device
  └── Emits: IpBlockAdded (if new), IpLeased
```

**Revocation**

```
revoke_ip(device, tier)
  ├── Authority: Root block authority
  ├── Validates: IP lease expired or authorized
  ├── Releases: Unit back to block bitmap
  ├── Updates: Root block availability
  ├── Closes: IpLease account
  └── Emits: IpRevoked
```

### Flow 4: Plan Creation

**Step 1: Create Service Agreement**

```
add_service_agreement(threshold, payout_ratio)
  ├── Creates: ServiceAgreement account
  ├── Example: threshold=90, payout_ratio=70
  └── Emits: ServiceAgreementAdded
```

**Step 2: Register Authentication Methods (Optional)**

```
register_auth_method(device, method_type, parameters)
  ├── Types: PSK, EAP, IPsec, WPA2E, WPA3E
  ├── Validates: Method-specific parameters
  ├── Creates: AuthMethod account on device
  └── Emits: AuthMethodRegistered
```

**Step 3a: Create L3 Plan (Original/Wholesale)**

```
add_l3_plan(name, price, duration, speed, capacity, start_at)
  ├── Requires: ServiceAgreement
  ├── Creates: Plan account
  ├── Creates: DistributionDomain
  ├── Sets: plan.distribution_domain = Some(...)
  ├── Sets: plan.parent_plan = None
  ├── Links: Optional auth_methods (max 2)
  ├── Validates:
  │   ├── Name: 1-32 chars
  │   ├── Price > 0
  │   ├── Duration > 0
  │   ├── Speed > 0
  │   └── Start time: now < start_at <= now+6months
  └── Emits: PlanAdded, DistributionDomainAdded
```

**Step 3b: Create L2 Plan (Derived/Retail)**

```
add_l2_plan(parent_plan, name, price, duration, speed, capacity, start_at)
  ├── Requires:
  │   ├── ServiceAgreement
  │   ├── Active subscription to parent_plan
  │   └── Parent plan exists
  ├── Creates: Plan account
  ├── Creates: AccessDomain
  ├── Sets: plan.access_domain = Some(...)
  ├── Sets: plan.parent_plan = Some(parent)
  ├── Links: Optional auth_methods (max 2)
  ├── Validates:
  │   ├── All L3 plan validations
  │   ├── duration <= parent.duration
  │   ├── speed <= parent.speed
  │   └── capacity <= parent.capacity
  └── Emits: PlanAdded, AccessDomainAdded
```

### Flow 5: Subscription & Token Economics

**Step 1: Subscribe to Plan**

```
subscribe(plan, device?)
  ├── Caller: Subscriber
  ├── Validates: Plan started (start_at <= now)
  ├── Payment Processing:
  │   ├── User transfers USDC for plan.price
  │   ├── Fee Distribution:
  │   │   ├── DAO fee → dao_dawn_account
  │   │   ├── Validator fee → validator_dawn_account
  │   │   └── Medallion fee → medallion_dawn_account
  │   ├── Swap portion to DAWN via Raydium CPI
  │   ├── Lock DAWN in subscription for 24h
  │   └── Transfer USDC to plan owner escrow
  ├── Creates: Subscription account
  ├── Sets:
  │   ├── expiration = now + (duration * 86400)
  │   ├── last_claim = now
  │   ├── claimable_dawn = locked DAWN amount
  │   └── daily_usdc = price / duration
  ├── Optional: Links device for fixed installations
  └── Emits: Subscribed(swap_price, claimable_dawn)
```

**Step 2: Lease IP to Subscriber Device**

```
lease_subscription_ip(device, subscription)
  ├── Requires: Active subscription
  ├── Executes: IPAM Subscriber allocation
  ├── Creates: IpLease (/32 address)
  └── Links: Device <-> Subscription <-> IP
```

**Step 3: Device Authentication & Connection**

```
AMF Flow:
  ├── Device uses AuthMethod from plan
  ├── Optional: register_credential() for client
  ├── Optional: register_connection() between entities
  └── Device connects to network with leased IP
```

**Step 4: Claim DAWN Tokens**

```
claim(subscription)
  ├── Validates: Time since last_claim >= 24h
  ├── Calculates: Daily claimable amount
  ├── Transfers: DAWN from escrow to subscriber
  ├── Updates: subscription.last_claim = now
  ├── Updates: subscription.claimable_dawn
  └── Emits: Claimed(dawn_amount, swap_price)
```

**Step 5: Extend Subscription**

```
extend_subscription(subscription)
  ├── Repeats: Payment processing
  ├── Extends: expiration += plan.duration
  └── Emits: SubscriptionExtended
```

### Flow 6: Authentication Method Framework

**Step 1: Register Authentication Method**

```
register_auth_method(device, method_type, parameters)
  ├── Method Types:
  │   ├── PSK: Pre-shared key (WPA2/WPA3)
  │   ├── EAP: 802.1X with RADIUS
  │   ├── IPsec: AH/ESP authentication
  │   └── WPA2E/WPA3E: Enterprise WiFi
  ├── Validates: Method-specific parameters
  ├── Creates: AuthMethod on device
  └── Emits: AuthMethodRegistered
```

**Step 2: Link to Plan**

```
add_auth_method(plan, auth_method)
  ├── Validates: AuthMethod authority matches
  ├── Adds: auth_method to plan.auth_methods (max 2)
  └── Emits: AuthMethodAdded
```

**Step 3: Register Client Credential**

```
register_credential(auth_method, client, credential_data)
  ├── Authority: AuthMethod owner
  ├── Creates: Credential account
  ├── Stores: Encrypted credential_data (128 bytes)
  └── Emits: CredentialRegistered
```

**Step 4: Register Connection**

```
register_connection(auth_method, entity_a, entity_b, cred_a, cred_b)
  ├── Authority: AuthMethod owner
  ├── Creates: Connection account
  ├── Stores: Bidirectional credentials
  └── Emits: ConnectionRegistered
```

**Step 5: Device Authentication**

```
Device connects using:
  ├── AuthMethod parameters
  ├── Credential (if registered)
  └── Connection (if registered)
```

**Step 6: Revocation**

```
revoke_credential(credential) or revoke_connection(connection)
  ├── Authority: AuthMethod owner
  ├── Marks: credential/connection as inactive
  └── Emits: CredentialRevoked or ConnectionRevoked
```

## State Account Reference

### All Account Types with PDA Seeds

```rust
// Configuration
Config: ["config"]
TokenConfig: ["token"]

// Devices
DeviceModel: ["device_model", device_type, manufacturer, model]
Device: ["device", owner, model, name, mac_address]
DeviceLocation: ["device_location", device]

// Domains
LocalDomain: ["local_domain", owner, name]
DistributionDomain: ["distribution_domain", plan, local_domain]
AccessDomain: ["access_domain", plan, local_domain]

// Plans & Subscriptions
ServiceAgreement: ["service_agreement", threshold, payout_ratio]
Plan: ["plan", local_domain, parent_plan?, name, price, duration, speed, capacity, start_at, service_agreement]
Subscription: ["subscription", plan, subscriber]

// IPAM
IpRegistry: ["ip_registry", tier]
RootIpBlock: ["root_ip_block", tier, index]
IpBlock: ["ip_block", root_ip_block, block_index]
IpLease: ["ip_lease", tier, device]

// Authentication
AuthMethod: ["auth_method", authority, method_type, parameters[..32]]
Credential: ["credential", auth_method, client]
Connection: ["connection", auth_method, entity_a, entity_b]
```

## Constants & Configuration

```rust
// Basis Points
BPS_DENOMINATOR: 10_000              // 100% = 10,000 BPS

// IPAM Block Sizing
BLOCK_CIDR: 22                       // /22 blocks (fixed)
UNITS_PER_BLOCK_32: 1024             // For /32 tiers (Subscriber, Loopback)
UNITS_PER_BLOCK_31: 512              // For /31 tier (PtP)
CHUNKS_PER_BLOCK_32: 16              // 1024 bits / 64 = 16 chunks
CHUNKS_PER_BLOCK_31: 8               // 512 bits / 64 = 8 chunks
MAX_ROOT_BLOCKS: 256                 // Per tier

// String Limits
MAX_DEVICE_MANUFACTURER_LEN: 64
MAX_DEVICE_MODEL_LEN: 64
MAX_SEED_LEN: 32                     // For PDA derivation

// Token
DAWN_DECIMALS: 6
MINT_AMOUNT: 1_000_000_000 * 10^6   // 1B DAWN initial mint
```

## Error Reference

### Common Errors

- `InsufficientFunds`: Not enough tokens for operation
- `InvalidMint`: Wrong token mint provided
- `Overflow` / `Underflow`: Arithmetic operation failed

### IPAM Errors

- `InvalidTier`: Invalid IpTier specified
- `InvalidUnitIndex`: Unit index out of bounds
- `CapacityExhausted`: No more IPs available in block
- `IpBlockNotFound`: IP block doesn't exist
- `IpLeaseNotFound`: IP lease doesn't exist
- `IpLeaseExpired`: Lease has expired
- `IpLeaseNotExpired`: Cannot revoke active lease
- `NoAvailableBlocks`: Root block exhausted
- `BlockAccountIsMissing`: Required block account not provided
- `InvalidSequence`: Root block sequence invalid
- `RegistryNotFound`: IP registry doesn't exist
- `AllTiersExhausted`: No IPs available across all tiers
- `RootBlockAlreadyExists`: Duplicate root block
- `MaxRootBlocksReached`: Tier at max capacity (256)
- `SequenceOutOfBounds`: Sequence number too large
- `IPv4Overflow`: IPv4 calculation overflow
- `IPv4RangeExceedsMax`: Range exceeds u32::MAX
- `IPv4NotAligned`: IP not aligned to network boundary
- `InvalidCidr`: Invalid CIDR prefix length

### Device Errors

- `EmptyDeviceManufacturer`: Manufacturer name empty
- `EmptyDeviceModel`: Model name empty
- `DeviceManufacturerTooLong`: >64 chars
- `DeviceModelTooLong`: >64 chars
- `EmptyDeviceName`: Device name empty
- `DeviceNameTooLong`: >32 chars
- `InvalidHeight`: Height invalid or zero
- `InvalidLatitude`: Latitude zero or out of range
- `InvalidLongitude`: Longitude zero or out of range
- `InvalidPlacementAzimuth`: Not in 0-36000 range
- `InvalidPlacementTilt`: Not in -9000-9000 range
- `InvalidDeviceType`: Invalid device type
- `InvalidDevice`: Device validation failed
- `DeviceRequired`: Operation requires device

### Plan Errors

- `ZeroPlanPrice`: Price must be > 0
- `ZeroPlanDuration`: Duration must be > 0
- `ZeroPlanSpeed`: Speed must be > 0
- `PlanExpired`: Plan is no longer available
- `EmptyPlanName`: Plan name empty
- `PlanNameTooLong`: >32 chars
- `InvalidStartTime`: Start time invalid
- `ParentPlanNeedSubscription`: Must subscribe to parent first
- `OutsideParentBounds`: L2 plan exceeds parent limits
- `DeviceNotInLocalDomain`: Device not in plan's domain

### Domain Errors

- `EmptyLocalDomainName`: Domain name empty
- `LocalDomainNameTooLong`: >32 chars
- `AccessDomainRequired`: Operation needs access domain
- `DistributionDomainRequired`: Operation needs distribution domain
- `DistributionDomainForL3PlansOnly`: Only L3 plans create distribution
- `AccessDomainForL2PlansOnly`: Only L2 plans create access

### Subscription & Claim Errors

- `SubscriptionExpired`: Subscription no longer valid
- `ClaimTooEarly`: Must wait 24h between claims
- `InvalidVault`: Escrow vault invalid

### Service Agreement Errors

- `ZeroThreshold`: Threshold must be > 0
- `ZeroPayoutRatio`: Payout ratio must be > 0

### Authentication Errors

- `InvalidAuthMethodType`: Unknown auth method
- `InactiveAuthMethod`: Auth method disabled
- `DuplicateAuthMethods`: Cannot add same method twice
- `TooManyAuthMethods`: Max 2 methods per plan
- `InvalidAuthMethodAccount`: Auth method account invalid
- `InvalidAuthMethodAuthority`: Wrong authority
- `InvalidCipherSuite`: Invalid cipher configuration
- `InvalidEncryptionType`: Invalid encryption algorithm
- `InvalidEAPType`: Invalid EAP type
- `InvalidFragmentSize`: Fragment size out of range
- `InvalidSessionTimeout`: Session timeout invalid
- `InvalidSecurityStandard`: Invalid security standard
- `InvalidEncryptionAlgorithm`: Invalid encryption algorithm
- `InvalidRotationInterval`: Key rotation invalid
- `InvalidNetworkId`: Network ID invalid
- `InvalidIPsecAlgorithm`: IPsec algorithm invalid
- `InvalidKeyLifetime`: Key lifetime invalid
- `InvalidIPsecMode`: IPsec mode invalid
- `InvalidReplayWindowSize`: Replay window invalid
- `InvalidDHGroup`: Diffie-Hellman group invalid

### Config Errors

- `InvalidFeeBps`: Fee exceeds 10,000 BPS
- `TotalFeesExceedMax`: Sum of fees > 100%
- `InvalidRaydiumProgram`: Wrong Raydium program ID
- `InvalidRaydiumPoolOwner`: Pool not owned by Raydium
- `Unauthorized`: Caller not authorized

## Event Reference

All state changes emit events for off-chain indexing:

### Initialization Events

- `TokenConfigInitialized`: Token system ready
- `IpRegistryInitialized`: IPAM registry created
- `RootIpBlockInitialized`: Root block added

### Device Events

- `DeviceModelAdded`: New device type available
- `DeviceAdded`: Device registered
- `DeviceLocationAdded`: Location recorded
- `DeviceLocationVerified`: Location verified by authority

### Domain Events

- `LocalDomainAdded`: Local namespace created
- `DistributionDomainAdded`: L3 distribution domain
- `AccessDomainAdded`: L2 access domain

### Plan Events

- `ServiceAgreementAdded`: SLA created
- `PlanAdded`: Plan available (L3 or L2)
- `AuthMethodAdded`: Auth linked to plan

### Subscription Events

- `Subscribed`: New subscription created
- `SubscriptionExtended`: Subscription renewed
- `Claimed`: DAWN tokens claimed

### IPAM Events

- `IpBlockAdded`: New block created on-demand
- `IpBlockFull`: Block exhausted
- `IpBlockNonFull`: Block has capacity again
- `RootIpBlockFull`: Root block exhausted
- `RootIpBlockNonFull`: Root block has capacity
- `IpLeased`: IP assigned to device
- `IpRevoked`: IP released

### AMF Events

- `AuthMethodRegistered`: Auth method created
- `CredentialRegistered`: Client credential added
- `CredentialRevoked`: Credential invalidated
- `ConnectionRegistered`: Connection established
- `ConnectionRevoked`: Connection terminated

## SDK Usage

### PDA Derivation Pattern

All PDA functions in `sdk/pda/` follow the pattern `get<Entity>Pda()`:

```typescript
// Config
getConfigPda(programId)
getTokenConfigPda(programId)

// Devices
getDeviceModelPda(deviceType, manufacturer, model, programId)
getDevicePda(owner, model, name, macAddress, programId)
getDeviceLocationPda(device, programId)

// Domains
getLocalDomainPda(owner, name, programId)
getAccessDomainPda(plan, localDomain, programId)
getDistributionDomainPda(plan, localDomain, programId)

// Plans
getServiceAgreementPda(threshold, payoutRatio, programId)
getPlanPda(
  localDomain,
  parentPlan,
  name,
  price,
  duration,
  speed,
  capacity,
  startAt,
  serviceAgreement,
  programId,
)
getSubscriptionPda(plan, subscriber, programId)

// IPAM
getIpRegistryPda(tier, programId)
getRootIpBlockPda(tier, index, programId)
getIpBlockPda(rootIpBlock, blockIndex, programId)
getIpLeasePda(tier, device, programId)

// AMF
getAuthMethodPda(authority, methodType, parameters, programId)
getCredentialPda(authMethod, client, programId)
getConnectionPda(authMethod, entityA, entityB, programId)
```

## CLI Reference

### Configuration

```bash
# Initialize protocol (one-time)
dawn config init --authority <keypair-path> \
  --usdc-mint <address> \
  --dao-fee 300 \
  --validator-fee 300 \
  --medallion-fee 900

# Get config
dawn config get

# Update config
dawn config update --dao-fee 350
```

### IPAM Setup

```bash
# Initialize root IP block
dawn ipam init-root-block \
  --tier subscriber \
  --base-ipv4 178257920 \
  --cidr 10

# Get registries
dawn ipam get-registries

# Get root blocks
dawn ipam get-root-blocks --tier subscriber

# Get IP blocks
dawn ipam get-ip-blocks --root-block <address>

# Get IP leases
dawn ipam get-ip-leases --device <address>
```

### Device Management

```bash
# Add device model (authority)
dawn devices add-model \
  --type router \
  --manufacturer "Ubiquiti" \
  --model "EdgeRouter X"

# Get device models
dawn devices get-models

# Add device
dawn devices add \
  --model <pubkey> \
  --name "Gateway-01" \
  --height 10 \
  --latitude 37774900 \
  --longitude -122419400 \
  --azimuth 18000 \
  --tilt 0 \
  --mac "AA:BB:CC:DD:EE:FF" \
  --local-domain "mynetwork"

# Get devices
dawn devices get --owner <address>

# Get device locations
dawn devices get-locations --device <address>
```

### Plans & Service Agreements

```bash
# Add service agreement
dawn plans add-service-agreement \
  --threshold 90 \
  --payout-ratio 70

# Add L3 plan (original)
dawn plans add-l3 \
  --service-agreement <pubkey> \
  --name "Enterprise 1Gbps" \
  --price 1000000000 \
  --duration 30 \
  --speed 1000 \
  --capacity 0

# Add L2 plan (resale)
dawn plans add-l2 \
  --parent-plan <pubkey> \
  --service-agreement <pubkey> \
  --name "Small Business 100Mbps" \
  --price 150000000 \
  --duration 30 \
  --speed 100 \
  --capacity 10000

# Get plans
dawn plans get --owner <address>

# Get service agreements
dawn plans get-service-agreements
```

### Authentication

```bash
# Register PSK auth method
dawn auth register-psk \
  --device <pubkey> \
  --standard wpa3 \
  --encryption aes \
  --rotation 86400 \
  --ssid "DAWN-Network"

# Add auth method to plan
dawn auth add-auth-method \
  --plan <pubkey> \
  --auth-method <pubkey>
```

### Subscriptions

```bash
# Subscribe to plan
dawn subscriptions subscribe \
  --plan <pubkey> \
  --device <pubkey>

# Lease IP to subscription device
dawn ipam lease-subscription-ip \
  --device <pubkey> \
  --subscription <pubkey>

# Claim DAWN tokens
dawn subscriptions claim \
  --subscription <pubkey>

# Get subscriptions
dawn subscriptions get --subscriber <address>
```

### Utilities

```bash
# Mint test USDC (devnet/testnet)
dawn utils mint-usdc --amount 1000000000

# Get USDC balance
dawn utils get-usdc-balance --address <address>

# Parse keypair
dawn utils parse-key --file <keypair-path>
```

## Testing Guide

The test suite in `tests/dawn/` provides comprehensive coverage following the protocol flow:

### Test Sequence

1. **00_config.ts** - Protocol initialization

   - Initialize token system
   - Initialize fee accounts
   - Initialize config
   - Validates: Config values, token mints, fee accounts

2. **01_device_model.ts** - Device types

   - Add router model
   - Add wireless radio model
   - Validates: Device model creation by authority

3. **02_device.ts** - Device registration

   - Add devices with locations
   - Test location validation
   - Validates: Device creation, location data, local domain auto-creation

4. **03_service_agreement.ts** - Service agreements

   - Create SLAs with different terms
   - Validates: Threshold and payout ratios

5. **04_plan.ts** - Plan hierarchy

   - Create L3 plans (distribution)
   - Create L2 plans (access)
   - Validates: Plan creation, domain creation, parent-child relationships

6. **05_subscription.ts** - Subscriptions

   - Subscribe to plans
   - Test payment processing
   - Validates: Subscription creation, USDC payment, DAWN swap, escrow

7. **06_claim.ts** - Token claiming

   - Claim DAWN after 24h
   - Test early claim rejection
   - Validates: Claiming logic, DAWN distribution

8. **07_amf.ts** - AMF authentication (EAP, WPA2)

   - Register EAP auth methods
   - Register WPA2E auth methods
   - Add auth to plans
   - Validates: Auth method creation, plan linking

9. **08_psk_amf.ts** - PSK authentication

   - Register PSK auth methods
   - Test credential management
   - Validates: PSK parameters, credentials

10. **09_ipam.ts** - IPAM operations
    - Initialize root blocks
    - Allocate IPs to devices
    - Lease IPs to subscriptions
    - Revoke IPs
    - Validates: IPAM hierarchy, bitmap allocation, lease lifecycle

### Running Tests

```bash
# Run all tests
yarn test

# Run specific test
yarn test tests/dawn/00_config.ts

# Run with logs
yarn test --verbose
```

## Development Workflow

### Building

```bash
# Build program
anchor build

# Copy to test fixtures
cp target/deploy/dawn.so tests/fixtures/

# Build CLI
npm run build
```

### Deployment

```bash
# Devnet
./scripts/devnet-setup.sh

# Testnet
./scripts/testnet-setup.sh

# Local validator
./scripts/run-local-validator.sh
```

### Generating Types

```bash
# Generate IDL
anchor build

# IDL location
target/idl/dawn.json

# TypeScript types
target/types/dawn.ts
```

## Security Considerations

### Account Security

- Validate all account constraints
- Use proper PDA seeds (deterministic derivation)
- Implement access control (authority checks)
- Check for arithmetic overflow/underflow
- Validate all numeric inputs (fees, coordinates, etc.)

### Token Operations

- Use SPL Token program for all token operations
- Validate token mint authorities
- Implement proper escrow patterns
- Handle fee distribution carefully
- Protect against reentrancy (use proper CPI patterns)

### IPAM Security

- Validate IPv4 ranges don't overflow u32
- Ensure proper alignment to network boundaries
- Protect against double-allocation with bitmaps
- Validate tier-specific constraints
- Authority-only operations for infrastructure IPs

### Plan Security

- Validate L2 plans stay within parent bounds
- Require parent subscription for L2 creation
- Validate start times and durations
- Protect against fee manipulation
- Verify auth method ownership

## Best Practices

### Performance Optimization

- Minimize account space usage (fixed-size arrays where possible)
- Optimize compute units (batch operations, efficient algorithms)
- Use zero-copy for large data structures (IpBlock bitmaps)
- Lazy account creation (IpBlocks created on-demand)
- Bitmap operations for O(1) allocation

### Testing Best Practices

- Use anchor-bankrun for fast, deterministic tests
- Test the complete flow, not just individual instructions
- Test error conditions thoroughly
- Verify event emission
- Test state transitions and invariants
- Test edge cases (boundary values, overflow, etc.)

### Solana/Anchor Best Practices

#### MCP Tools Usage

**MANDATORY**: Always use Solana MCP tools before general debugging:

1. Anchor errors → "Ask Solana Anchor Framework Expert"
2. Solana concepts → "Solana Expert: Ask For Help"
3. Documentation → "Solana Documentation Search"
4. Ecosystem (Raydium, etc.) → "Solana Ecosystem Docs Searcher"

#### Quick Decision Rules

1. **See "Anchor" in error?** → Anchor Expert first
2. **See hex error codes?** → Solana Expert first
3. **Need syntax/format?** → Documentation Search first
4. **Using Raydium/Jupiter?** → Ecosystem Searcher first

#### Common Error Patterns

- `AnchorError::AccountDiscriminatorMismatch` → Ask Anchor Expert
- `0x1` (Computational budget) → Ask Solana Expert
- PDA derivation issues → Ask Anchor Expert
- CPI failures → Ask Solana Expert

## Always Remember

- Security first - validate everything
- Test thoroughly - cover edge cases
- Use MCP tools for Solana/Anchor issues
- Follow established project patterns
- Document complex logic
- Optimize for performance and cost
- Emit events for all state changes
- Handle errors gracefully with descriptive messages
