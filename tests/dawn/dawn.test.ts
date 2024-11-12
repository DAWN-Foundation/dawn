import { initTests } from './00_init'
import { buildingTests } from './01_building'
import { planTests } from './02_plan'
import { subscriptionTests } from './03_subscription'
import { claimTests } from './04_claim'

// order is important here
// because tests are dependent on the previous ones
// they accumulate state in logical order:
// - init (creates config)
// - building (adds building)
// - plan (adds plan)
// - subscription (subscribes to plan)
// - claim (claims DAWN from subscription escrow)
initTests()
buildingTests()
planTests()
subscriptionTests()
claimTests()
