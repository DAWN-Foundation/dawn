# Subscribe with IP Allocation - Usage Example

## Overview

The DAWN protocol uses a **two-step pattern** for device subscriptions with IP allocation:

1. **Subscribe**: Creates subscription and emits `IpAllocationNeeded` event when device is present
2. **Lease IP**: Allocates IP address using the strict-first IPAM algorithm

This pattern provides flexibility while maintaining atomicity through transaction batching.

## Client-Side Implementation

### 1. Prerequisites

Before calling `subscribe_with_ip`, ensure:
- The subscriber root IP block is initialized (`initialize_root_ip_block` or `initialize_all_root_ip_blocks`)
- The device is registered and owned by the caller
- The plan exists and is active

### 2. Finding Next Available IP

```typescript
import { PublicKey } from '@solana/web3.js';

// Load the subscriber root IP block
const [subscriberRootPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("root_ip_block"), Buffer.from([0])], // Tier::Subscriber = 0
  program.programId
);

const rootIpBlock = await program.account.rootIpBlock.fetch(subscriberRootPda);

// Find next available IP
function findNextAvailableIp(rootIpBlock: any): { blockIdx: number, ipv4: number } {
  // Try to find existing non-full block
  if (rootIpBlock.rootSummary64.toString() !== "0") {
    // There are non-full blocks available
    // For simplicity, we'll use block 0 and IP base (client should implement proper search)
    const blockIdx = 0; // This should be calculated using trailing_zeros on rootSummary64
    const blockBase = rootIpBlock.baseIpv4 + (blockIdx << (32 - 22)); // /22 block size
    return { blockIdx, ipv4: blockBase }; // Client should find actual next free IP
  }
  
  // Create new block
  if (rootIpBlock.blocksCreated < rootIpBlock.blocksTotal) {
    const blockIdx = rootIpBlock.blocksCreated;
    const blockBase = rootIpBlock.baseIpv4 + (blockIdx << (32 - 22));
    return { blockIdx, ipv4: blockBase }; // New block starts at unit 0
  }
  
  throw new Error("No IP addresses available");
}

const { blockIdx, ipv4 } = findNextAvailableIp(rootIpBlock);
```

### 3. Two-Step Pattern Implementation

#### Option A: Sequential Transactions

```typescript
// Step 1: Subscribe (creates subscription + emits IpAllocationNeeded event)
const subscribeIx = await program.methods
  .subscribe()
  .accounts({
    caller: caller.publicKey,
    config: configPda,
    plan: planPubkey,
    device: devicePubkey, // When present, triggers IpAllocationNeeded event
    subscription: subscriptionPda,
    // ... all payment and raydium accounts
  })
  .instruction();

await sendTransaction([subscribeIx]);

// Step 2: Listen for event and allocate IP
program.addEventListener('IpAllocationNeeded', async (event) => {
  console.log('IP allocation needed for device:', event.device.toString());
  
  // Find next available IP
  const { blockIdx, ipv4 } = findNextAvailableIp(rootIpBlock);
  
  // Derive IPAM PDAs
  const [ipBlockPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ip_block"), Buffer.from([0]), Buffer.from(blockIdx.toString())],
    program.programId
  );
  
  const [ipLeasePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("ip_lease"), Buffer.from([0]), Buffer.from(ipv4.toString()), Buffer.from([32])],
    program.programId
  );
  
  // Allocate IP
  const leaseIpIx = await program.methods
    .leaseIpStrictFirst(0, event.lease_duration, blockIdx, ipv4) // 0 = Tier::Subscriber
    .accounts({
      caller: caller.publicKey,
      device: event.device,
      rootIpBlock: subscriberRootPda,
      ipBlock: ipBlockPda,
      ipLease: ipLeasePda,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
    
  await sendTransaction([leaseIpIx]);
});
```

#### Option B: Atomic Transaction (Recommended)

```typescript
// Create both instructions
const subscribeIx = await program.methods
  .subscribe()
  .accounts({
    // ... subscription accounts
  })
  .instruction();

// Find next available IP first
const { blockIdx, ipv4 } = findNextAvailableIp(rootIpBlock);

const leaseIpIx = await program.methods
  .leaseIpStrictFirst(0, subscriptionDuration, blockIdx, ipv4)
  .accounts({
    // ... IPAM accounts
  })
  .instruction();

// Send both instructions in single atomic transaction
const transaction = new Transaction().add(subscribeIx, leaseIpIx);
const signature = await sendTransaction(transaction);

console.log('Subscription and IP allocation completed:', signature);
```

## Error Handling

### Subscribe Instruction
- Plan timing validation (start_at)
- Device ownership validation
- Payment processing failures

### Lease IP Instruction
- Root IP block not initialized
- Invalid block_idx or ipv4 parameters
- IP address already allocated
- No more IP addresses available in the tier
- Device not found

## Events Emitted

### Step 1: Subscribe
1. `Subscribed` - Standard subscription event
2. `IpAllocationNeeded` - Emitted when device is present:
   - `subscription`: Created subscription PDA
   - `device`: Device requiring IP allocation
   - `tier`: 0 (Subscriber)
   - `lease_duration`: How long the IP lease should last

### Step 2: Lease IP
3. `IpamIpLeased` - IP allocation event:
   - `ip_lease`: PDA of the IP lease account
   - `device`: Device that received the IP
   - `tier`: 0 (Subscriber)
   - `ipv4`: Allocated IPv4 address
   - `prefix`: 32 (/32 subnet)
   - `lease_end`: When the IP lease expires
   - `block_idx`: Which IP block was used
   - `unit_idx`: Which unit within the block

## Benefits of Two-Step Pattern

- **Flexibility**: Client controls the flow and timing
- **Composability**: Can combine with other operations
- **Simplicity**: Each instruction has single responsibility
- **Backward Compatibility**: Original subscribe works for mobile-only
- **Atomicity**: Can batch both instructions for atomic execution
- **Event-Driven**: Clear separation and monitoring capabilities
