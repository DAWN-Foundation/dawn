# Proof of Bandwidth (PoB) Program

A standalone Solana program for decentralized bandwidth verification using min-hash statistical testing.

## Overview

The PoB program implements a cryptographic bandwidth verification protocol where:
- **Provers** claim to provide specific bandwidth
- **Challengers** test these claims by sending packets
- **Aggregators** collect min-hash statistics to estimate delivery rates
- **Data Anchor** stores off-chain proofs and commitments

## Program ID

**Devnet/Localnet**: `PoBrUKPnS6aHnXpAgtQYnLK7mQzFGF5ktk6CrXA9b8N`

## Architecture

### State Accounts

- `Prover` - Bandwidth provider registration
- `Challenger` - Bandwidth tester registration  
- `RoundCommitment` - Test round parameters and commitments
- `Aggregator` - Accumulates min-hash observations per (round, prover)
- `Receipt` - Replay protection for submitted tokens

### Instructions

1. `register_prover` - Register as a bandwidth prover
2. `register_challenger` - Register as a bandwidth challenger
3. `init_challenge_round` - Create a new testing round
4. `emit_session_commitment` - Log session commitment to Data Anchor
5. `submit_min_hash` - Submit minimum hash observation
6. `finalize_aggregator` - Calculate final delivery rate estimate
7. `close_round` - Close and reclaim round account
8. `close_aggregator` - Close and reclaim aggregator account

## Key Features

### Min-Hash Statistical Testing

Uses order statistics to estimate packet delivery:
- Score = `H(seed || token)` mapped to (0, 1]
- Estimate = `n_est = (1 - m) / m` where m is min score
- Final rate = `p_hat = min(1, avg(n_est) / N)`

### Replay Protection

Receipt PDAs prevent duplicate submissions:
- Seeds: `[b"receipt", round, prover, min_token]`
- Each token can only be submitted once per round

### Data Anchor Integration

Off-chain storage via CPI:
- Session commitments stored in Data Anchor
- Merkle proofs verify inclusion
- Minimizes on-chain footprint

## Building

```bash
anchor build --program-name pob
```

## Testing

```bash
yarn test tests/pob/pob.test.ts
```

## Security Features

- Slot-based timing validation
- Authority verification on all operations
- Cryptographically secure score calculation using seed
- Receipt-based replay prevention
- Checked arithmetic for overflow protection

## Documentation

See root documentation:
- `PoB v2 Orchestrator.md` - Full architecture
- `pob-accounts.md` - Account structure details
- `pob-diagram.md` - Sequence diagrams
