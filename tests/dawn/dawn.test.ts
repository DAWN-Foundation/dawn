import { initTests } from './00_init'
import { ipPoolTests, leaseIpTests } from './01_ip_pool'
import { deviceModelTests } from './02_device_model'
import { deviceTests } from './03_device'

import { parentPlanTests, planTests } from './04_plan'
import { subscriptionTests } from './05_subscription'
import { claimTests } from './06_claim'

// order is important here
// because tests are dependent on the previous ones
// they accumulate state in logical order:
// - init (creates config)
// - ip_pool (adds IP pool)
// - device_model (adds device model)
// - device (adds device)
// - plan (adds plan)
// - subscription (subscribes to plan)
// - claim (claims DAWN from subscription escrow)
initTests()
ipPoolTests()
deviceModelTests()
deviceTests()
leaseIpTests()
planTests()
subscriptionTests()
parentPlanTests()
claimTests()
