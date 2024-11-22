import { initTests } from './00_init'
import { deviceModelTests } from './01_device_model'
import { deviceTests } from './02_device'

import { planTests } from './03_plan'
import { subscriptionTests } from './04_subscription'
import { claimTests } from './05_claim'

// order is important here
// because tests are dependent on the previous ones
// they accumulate state in logical order:
// - init (creates config)
// - device_model (adds device model)
// - device (adds device)
// - plan (adds plan)
// - subscription (subscribes to plan)
// - claim (claims DAWN from subscription escrow)
initTests()
deviceModelTests()
deviceTests()
planTests()
subscriptionTests()
claimTests()
