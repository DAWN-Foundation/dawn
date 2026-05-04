import { createHash } from 'crypto'

/**
 * Anchor instruction discriminators are the first 8 bytes of
 * sha256("global:" + snake_case_function_name).
 *
 * Anchor account discriminators are the first 8 bytes of
 * sha256("account:" + CamelCaseStructName).
 *
 * Anchor event discriminators are the first 8 bytes of
 * sha256("event:" + CamelCaseStructName).
 */

function disc(prefix: 'global' | 'account' | 'event', name: string): Buffer {
  return createHash('sha256').update(`${prefix}:${name}`).digest().subarray(0, 8)
}

export function ixDisc(name: string): Buffer {
  return disc('global', name)
}

export function accountDisc(name: string): Buffer {
  return disc('account', name)
}

export function eventDisc(name: string): Buffer {
  return disc('event', name)
}

/** Precomputed instruction discriminators for every `pub fn` in lib.rs. */
export const IX_DISC = {
  init_token: ixDisc('init_token'),
  init_fee_accounts: ixDisc('init_fee_accounts'),
  initialize_config: ixDisc('initialize_config'),
  init_metadata: ixDisc('init_metadata'),
  update_config: ixDisc('update_config'),
  register_auth_method: ixDisc('register_auth_method'),
  add_auth_method: ixDisc('add_auth_method'),
  register_credential: ixDisc('register_credential'),
  register_credential_for: ixDisc('register_credential_for'),
  revoke_credential: ixDisc('revoke_credential'),
  register_connection: ixDisc('register_connection'),
  revoke_connection: ixDisc('revoke_connection'),
  add_device_model: ixDisc('add_device_model'),
  add_device: ixDisc('add_device'),
  add_device_for: ixDisc('add_device_for'),
  verify_device_location: ixDisc('verify_device_location'),
  add_service_agreement: ixDisc('add_service_agreement'),
  add_l3_plan: ixDisc('add_l3_plan'),
  add_l2_plan: ixDisc('add_l2_plan'),
  subscribe: ixDisc('subscribe'),
  subscribe_for: ixDisc('subscribe_for'),
  extend_subscription: ixDisc('extend_subscription'),
  extend_subscription_for: ixDisc('extend_subscription_for'),
  claim: ixDisc('claim'),
  initialize_root_ip_block: ixDisc('initialize_root_ip_block'),
  allocate_ip: ixDisc('allocate_ip'),
  lease_subscription_ip: ixDisc('lease_subscription_ip'),
  lease_subscription_ip_for: ixDisc('lease_subscription_ip_for'),
  revoke_ip: ixDisc('revoke_ip'),
  update_local_domain_status: ixDisc('update_local_domain_status'),
} as const

/** Precomputed account discriminators for every `#[account]` struct in state/. */
export const ACCOUNT_DISC = {
  AccessDomain: accountDisc('AccessDomain'),
  AuthMethod: accountDisc('AuthMethod'),
  Config: accountDisc('Config'),
  Connection: accountDisc('Connection'),
  Credential: accountDisc('Credential'),
  Device: accountDisc('Device'),
  DeviceLocation: accountDisc('DeviceLocation'),
  DeviceModel: accountDisc('DeviceModel'),
  DistributionDomain: accountDisc('DistributionDomain'),
  IpBlock: accountDisc('IpBlock'),
  IpLease: accountDisc('IpLease'),
  IpRegistry: accountDisc('IpRegistry'),
  LocalDomain: accountDisc('LocalDomain'),
  Plan: accountDisc('Plan'),
  RootIpBlock: accountDisc('RootIpBlock'),
  ServiceAgreement: accountDisc('ServiceAgreement'),
  Subscription: accountDisc('Subscription'),
  TokenConfig: accountDisc('TokenConfig'),
} as const
