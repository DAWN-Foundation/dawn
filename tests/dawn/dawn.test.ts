import { configTests } from './00_config'
import { ipPoolTests, leaseIpTests } from './01_ip_pool'
import { deviceModelTests } from './02_device_model'
import { siteTests } from './03_site'
import { deviceTests } from './04_device'

import { parentPlanTests, planTests } from './05_plan'
import { subscriptionTests } from './06_subscription'
import { claimTests } from './07_claim'

// order is important here
// because tests are dependent on the previous ones
// they accumulate state in logical order:
// - init (creates config)
// - ip_pool (adds IP pool)
// - device_model (adds device model)
// - site (adds site)
// - device (adds device)
// - plan (adds plan)
// - subscription (subscribes to plan)
// - claim (claims DAWN from subscription escrow)
configTests()
ipPoolTests()
deviceModelTests()
siteTests()
deviceTests()
leaseIpTests()
planTests()
subscriptionTests()
parentPlanTests()
claimTests()
