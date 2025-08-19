import { configTests } from './00_config'
import { deviceModelTests } from './02_device_model'
import { siteTests } from './03_site'
import { deviceTests, deviceSiteTests } from './04_device'
import { serviceAgreementTests } from './05_service_agreement'
import { parentPlanTests, planTests } from './06_plan'
import { subscriptionTests } from './07_subscription'
import { leaseIpTests, releaseIpTests } from './11_ipam'
import { claimTests } from './08_claim'
import { amfTests } from './09_amf'
import { pskAmfTests } from './10_psk_amf'

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
leaseIpTests()
releaseIpTests()
// parentPlanTests()
// claimTests()
// amfTests()
// pskAmfTests()
