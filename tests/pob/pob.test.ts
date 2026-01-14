import { proofOfBandwidthTests } from './10_pob'
import { errorCaseTests } from './11_error_cases'
import { integrationTests } from './12_integration'
import { unstakingTests } from './13_unstaking'
import { unstakingErrorTests } from './14_unstaking_errors'
import { unstakingParticipationTests } from './15_unstaking_participation'

// PoB Test Suite
// Tests now share a single BankrunProvider instance to avoid state corruption
// Order is important: core tests run first to set up shared accounts

// Core functionality tests (runs first, sets up prover/challenger)
proofOfBandwidthTests()

// Error case tests (reuses registered accounts)
errorCaseTests()

// Full integration test with Data Anchor (uses separate round seeds)
integrationTests()

// Unstaking flow tests (creates separate test accounts)
unstakingTests()

// Unstaking error tests
unstakingErrorTests()

// Unstaking participation blocking tests
unstakingParticipationTests()
