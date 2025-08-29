import { configTests } from './00_config'
import { deviceModelTests } from './01_device_model'
import { siteTests } from './02_site'
import { deviceTests, deviceSiteTests } from './03_device'
import { serviceAgreementTests } from './04_service_agreement'
import { parentPlanTests, planTests } from './05_plan'
import { subscriptionTests } from './06_subscription'
import { claimTests } from './07_claim'
import { amfTests } from './08_amf'
import { pskAmfTests } from './09_psk_amf'
import {
  initializeRootIpBlockTests,
  bitmapEdgeCaseTests,
  multiTierIpamTests,
  leaseIpTests,
  releaseIpTests,
} from './10_ipam'

// order is important here
// because tests are dependent on the previous ones
// they accumulate state in logical order:
// - init (creates config)
// - device_model (adds device model)
// - site (adds site)
// - device (adds device)
// - service_agreement (adds service agreement)
// - plan (adds plan)
// - subscription (subscribes to plan)
// - lease_ip (leases IP addresses)
// - parent_plan (adds parent plan)
// - claim (claims DAWN from subscription escrow)
configTests()
deviceModelTests()
siteTests()
deviceTests()
deviceSiteTests()
serviceAgreementTests()
planTests()
subscriptionTests()
initializeRootIpBlockTests()
bitmapEdgeCaseTests()
multiTierIpamTests()
leaseIpTests()
releaseIpTests()
parentPlanTests()
claimTests()
amfTests()
pskAmfTests()
