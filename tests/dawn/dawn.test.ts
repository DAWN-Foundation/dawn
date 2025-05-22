import { configTests } from './00_config'
// import { ipPoolTests, leaseIpTests } from './01_ip_pool'
import { deviceModelTests } from './02_device_model'
import { siteTests } from './03_site'
import { deviceTests, deviceSiteTests } from './04_device'
import { serviceAgreementTests } from './05_service_agreement'
import { parentPlanTests, planTests } from './06_plan'
import { subscriptionTests } from './07_subscription'
import { claimTests } from './08_claim'
import { amfTests } from './09_amf'

// order is important here
// because tests are dependent on the previous ones
// they accumulate state in logical order:
// - init (creates config)
// - ip_pool (adds IP pool)
// - device_model (adds device model)
// - site (adds site)
// - device (adds device)
// - lease_ip (adds lease IP)
// - service_agreement (adds service agreement)
// - plan (adds plan)
// - subscription (subscribes to plan)
// - parent_plan (adds parent plan)
// - claim (claims DAWN from subscription escrow)
configTests()
// ipPoolTests()
deviceModelTests()
siteTests()
deviceTests()
deviceSiteTests()
// leaseIpTests()
serviceAgreementTests()
planTests()
subscriptionTests()
parentPlanTests()
claimTests()
amfTests()
