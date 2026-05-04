/**
 * Bootstrap-only capture run.
 *
 * Drives the protocol's one-time bootstrap sequence (init_token,
 * init_fee_accounts, initialize_config — preceded by USD.tel mint setup)
 * through the runScenario lifecycle. No business logic on top, no
 * scenario expectations — every dawn-program tx still gets the global
 * invariant checks the capture layer runs after every tx.
 */

import { runScenario } from './runner'

export const scenario = {
  name: 'bootstrap',
  seed: 1,
  expects: [], // global invariants do all the work for the bootstrap-only path
  run: async () => {
    // bootProtocol does everything; nothing extra needed here.
  },
}

if (require.main === module) {
  runScenario(scenario).catch((err) => {
    console.error('capture-bootstrap threw:', err)
    process.exit(1)
  })
}
