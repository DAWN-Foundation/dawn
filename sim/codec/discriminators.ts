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
  // bootstrap
  initialize_config: ixDisc('initialize_config'),
  update_config_authority: ixDisc('update_config_authority'),
  // access domain
  add_access_domain: ixDisc('add_access_domain'),
  set_control_plane_device: ixDisc('set_control_plane_device'),
  set_access_domain_gateway_device: ixDisc('set_access_domain_gateway_device'),
  // domain authority (Tier-2 grants)
  grant_domain_authority_for_access_domain: ixDisc('grant_domain_authority_for_access_domain'),
  revoke_domain_authority_for_access_domain: ixDisc('revoke_domain_authority_for_access_domain'),
  // amf
  register_auth_method: ixDisc('register_auth_method'),
  update_auth_method_params: ixDisc('update_auth_method_params'),
  register_credential_for: ixDisc('register_credential_for'),
  revoke_credential: ixDisc('revoke_credential'),
  // devices
  add_device_model: ixDisc('add_device_model'),
  add_device: ixDisc('add_device'),
  add_device_for: ixDisc('add_device_for'),
  verify_device_location: ixDisc('verify_device_location'),
  // local domain (management plane)
  update_local_domain_status: ixDisc('update_local_domain_status'),
  // access-domain authenticators (Access Points)
  register_authenticator: ixDisc('register_authenticator'),
  rotate_authenticator_pubkey: ixDisc('rotate_authenticator_pubkey'),
  revoke_authenticator: ixDisc('revoke_authenticator'),
} as const

/** Precomputed account discriminators for every `#[account]` struct in state/. */
export const ACCOUNT_DISC = {
  AccessDomain: accountDisc('AccessDomain'),
  AccessDomainAuthenticator: accountDisc('AccessDomainAuthenticator'),
  AuthMethod: accountDisc('AuthMethod'),
  Config: accountDisc('Config'),
  Credential: accountDisc('Credential'),
  Device: accountDisc('Device'),
  DeviceLocation: accountDisc('DeviceLocation'),
  DeviceModel: accountDisc('DeviceModel'),
  DomainAuthority: accountDisc('DomainAuthority'),
  LocalDomain: accountDisc('LocalDomain'),
} as const
