import { configTests } from './00_config'
// DISABLED with the instructions they exercise — see DAWN-minimal-deploy-squads
// import { deviceModelTests } from './01_device_model'
// import { deviceTests } from './02_device'
// import { serviceAgreementTests } from './03_service_agreement'
// import { parentPlanTests, planTests } from './04_plan'
// import { subscriptionTests } from './05_subscription'
// import { claimTests } from './06_claim'
// import { amfTests } from './07_amf'
// import { pskAmfTests } from './08_psk_amf'
// import {
//   allocateIpTests,
//   initializeRootIpBlockTests,
//   bitmapEdgeCaseTests,
//   multiTierIpamTests,
//   leaseIpTests,
//   revokeIpTests,
// } from './09_ipam'

// order is important here
// because tests are dependent on the previous ones
// they accumulate state in logical order:
// - init (creates config)
// - device_model (adds device model)
// - device (adds device)
// - service_agreement (adds service agreement)
// - plan (adds plan)
// - subscription (subscribes to plan)
// - lease_ip (leases IP addresses)
// - parent_plan (adds parent plan)
// - claim (claims DAWN from subscription escrow)
configTests()
// DISABLED with the instructions they exercise — see DAWN-minimal-deploy-squads
// deviceModelTests()
// deviceTests()
// serviceAgreementTests()
// planTests()
// subscriptionTests()
// initializeRootIpBlockTests()
// allocateIpTests()
// bitmapEdgeCaseTests()
// multiTierIpamTests()
// leaseIpTests()
// revokeIpTests()
// parentPlanTests()
// claimTests()
// amfTests()
// pskAmfTests()
