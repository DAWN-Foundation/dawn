import * as anchor from '@coral-xyz/anchor'
import { BN, Program } from '@coral-xyz/anchor'
import { PublicKey, Keypair, TransactionSignature } from '@solana/web3.js'
import { readFileSync } from 'fs'
import * as toml from 'toml'
import { Dawn } from '../../target/types/dawn'

import { BanksTransactionMeta } from 'solana-bankrun'
import { hasFlag } from '../../cli/shared/cli-utils'

function getProgramId(): PublicKey {
  const anchorToml = toml.parse(readFileSync('./Anchor.toml', 'utf-8'))

  const isDevnet = hasFlag('--devnet')

  return new PublicKey(
    isDevnet
      ? anchorToml.programs.devnet.dawn
      : anchorToml.programs.localnet.dawn,
  )
}

export const PROGRAM_ID = getProgramId()
export const COORD_DENOMINATOR = 1e6

export type DeviceType = anchor.IdlTypes<Dawn>['deviceType']
export type AuthMethodType = anchor.IdlTypes<Dawn>['authMethodType']

export type IpV4Bytes = [number, number, number, number]

export type MacAddress = [number, number, number, number, number, number]

export interface GenerateDevice {
  name: string
  coord: [number, number]
  mac: MacAddress
  height: number
  placement: [number, number]
  localDomain: string
}

export type IpV6Bytes = number[]

// Helper to fund an account with SOL
export async function fund(
  connection: anchor.web3.Connection,
  account: PublicKey,
  amount: number,
  commitment: 'confirmed' | 'finalized' = 'confirmed',
) {
  const signature = await connection.requestAirdrop(account, amount * 10 ** 9)
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash()
  await connection.confirmTransaction(
    {
      blockhash,
      lastValidBlockHeight,
      signature,
    },
    commitment,
  )
}

// Helper to get the event from the transaction
export async function getEvent<T>(
  program: Program<Dawn>,
  tx: BanksTransactionMeta,
  name: string,
): Promise<T> {
  const logs = tx.logMessages.filter((msg) => msg.startsWith('Program data: '))

  for (const log of logs) {
    const logEncoded = log.split('Program data: ')[1]
    const event = program.coder.events.decode(logEncoded)
    if (!event) continue
    if (event.name === name) {
      return event.data as T
    }
  }

  throw new Error(`Event with name ${name} not found`)
}

export async function getEvents<T>(
  program: Program<Dawn>,
  tx: BanksTransactionMeta,
  name: string,
): Promise<T[]> {
  const logs = tx.logMessages.filter((msg) => msg.startsWith('Program data: '))

  const events: T[] = []

  for (const log of logs) {
    const logEncoded = log.split('Program data: ')[1]
    const event = program.coder.events.decode(logEncoded)
    if (!event) continue
    if (event.name === name) {
      events.push(event.data as T)
    }
  }

  return events
}

export function deviceTypeSeed(deviceType: DeviceType) {
  if (deviceType.wirelessRadio) return Buffer.from([1])
  return Buffer.from([0])
}

// Helper to get all plans for a device
export async function getPlansForDevice(
  program: Program<Dawn>, // Anchor program
  device: PublicKey, // Public key of the device
): Promise<any[]> {
  // Define the byte offset for the `device` field in the Plan account (8 bytes for discriminator + 32 bytes for owner)
  const DEVICE_OFFSET = 8 + 32

  // Fetch all plan accounts and filter by device key
  const plans = await program.provider.connection.getProgramAccounts(
    program.programId,
    {
      // Filtering accounts by the `device` public key stored in the Plan account
      filters: [
        {
          memcmp: {
            offset: DEVICE_OFFSET, // Offset where the device public key is stored
            bytes: device.toBase58(), // The device public key to filter by
          },
        },
      ],
    },
  )

  // Decode and return the accounts
  return plans.map((accountInfo) => {
    return program.account.plan.coder.accounts.decode(
      'Plan',
      accountInfo.account.data,
    )
  })
}

/**
 * Find an available root block for subscriber IP allocation
 * Checks indices 0-255 for availability
 * @param program - The Dawn Anchor program
 * @param tier - IP tier (0 for Subscriber)
 * @returns The index of an available root block, or null if none found
 */
export async function findAvailableRootBlock(
  program: Program<Dawn>,
  tier: number = 0, // Subscriber tier by default
): Promise<number | null> {
  const MAX_ROOT_BLOCKS = 256
  const connection = program.provider.connection

  // Import the PDA derivation function
  const { getRootIpBlockPda } = await import('./index')

  // Scan through all possible root indices
  for (let index = 0; index < MAX_ROOT_BLOCKS; index++) {
    try {
      const rootPda = getRootIpBlockPda(tier, index)
      const account = await connection.getAccountInfo(rootPda)

      if (account) {
        // Decode the RootIpBlock account to check capacity
        const rootIpBlock = await program.account.rootIpBlock.fetch(rootPda)

        // Check if the root has free blocks
        // The has_free_blocks method checks if root_summary64 indicates capacity
        if (rootIpBlock.firstAvailableBlockIdx !== null) {
          return index
        }
      }
    } catch (e) {
      // Account doesn't exist or error fetching, continue to next
      continue
    }
  }

  return null // No available roots found
}

/**
 * Parameters for adding a device model
 */
export interface AddDeviceModelParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  configPda: PublicKey
  deviceModelPda: PublicKey
  deviceType: DeviceType
  manufacturer: string
  model: string
}

/**
 * Add a device model to the program
 * Returns the transaction for signing/confirmation
 */
export async function addDeviceModelTx(
  params: AddDeviceModelParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    caller,
    signer,
    configPda,
    deviceModelPda,
    deviceType,
    manufacturer,
    model,
  } = params

  return program.methods
    .addDeviceModel(deviceType, manufacturer, model)
    .accountsPartial({
      caller,
      config: configPda,
      deviceModel: deviceModelPda,
    })
    .signers([signer])
    .transaction()
}

/**
 * Add a device model and send via RPC (for error testing)
 */
export async function addDeviceModelRpc(
  params: AddDeviceModelParams,
): Promise<string> {
  const {
    program,
    caller,
    signer,
    configPda,
    deviceModelPda,
    deviceType,
    manufacturer,
    model,
  } = params

  return program.methods
    .addDeviceModel(deviceType, manufacturer, model)
    .accountsPartial({
      caller,
      config: configPda,
      deviceModel: deviceModelPda,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for adding a device
 */
export interface AddDeviceParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  deviceModelPda: PublicKey
  devicePda: PublicKey
  deviceLocationPda: PublicKey
  localDomainPda: PublicKey
  name: string
  height: number
  latitude: BN
  longitude: BN
  placement: [number, number] | number[]
  macAddress: MacAddress
  localDomain: string
}

/**
 * Add a device to the program
 * Returns the transaction for signing/confirmation
 */
export async function addDeviceTx(
  params: AddDeviceParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    caller,
    signer,
    deviceModelPda,
    devicePda,
    deviceLocationPda,
    localDomainPda,
    name,
    height,
    latitude,
    longitude,
    placement,
    macAddress,
    localDomain,
  } = params

  return program.methods
    .addDevice(
      name,
      height,
      latitude,
      longitude,
      placement,
      macAddress,
      localDomain,
    )
    .accountsPartial({
      caller,
      deviceModel: deviceModelPda,
      device: devicePda,
      deviceLocation: deviceLocationPda,
      localDomain: localDomainPda,
    })
    .signers([signer])
    .transaction()
}

/**
 * Add a device and send via RPC (for error testing)
 */
export async function addDeviceRpc(params: AddDeviceParams): Promise<string> {
  const {
    program,
    caller,
    signer,
    deviceModelPda,
    devicePda,
    deviceLocationPda,
    localDomainPda,
    name,
    height,
    latitude,
    longitude,
    placement,
    macAddress,
    localDomain,
  } = params

  return program.methods
    .addDevice(
      name,
      height,
      latitude,
      longitude,
      placement,
      macAddress,
      localDomain,
    )
    .accountsPartial({
      caller,
      deviceModel: deviceModelPda,
      device: devicePda,
      deviceLocation: deviceLocationPda,
      localDomain: localDomainPda,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for adding a device for a beneficiary
 */
export interface AddDeviceForParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  beneficiary: PublicKey
  deviceModelPda: PublicKey
  devicePda: PublicKey
  deviceLocationPda: PublicKey
  localDomainPda: PublicKey
  name: string
  height: number
  latitude: BN
  longitude: BN
  placement: [number, number] | number[]
  macAddress: MacAddress
  localDomain: string
}

/**
 * Add a device for a beneficiary
 * Returns the transaction for signing/confirmation
 */
export async function addDeviceForTx(
  params: AddDeviceForParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    caller,
    signer,
    beneficiary,
    deviceModelPda,
    devicePda,
    deviceLocationPda,
    localDomainPda,
    name,
    height,
    latitude,
    longitude,
    placement,
    macAddress,
    localDomain,
  } = params

  return program.methods
    .addDeviceFor(
      name,
      height,
      latitude,
      longitude,
      placement,
      macAddress,
      localDomain,
    )
    .accountsStrict({
      caller,
      beneficiary,
      deviceModel: deviceModelPda,
      device: devicePda,
      deviceLocation: deviceLocationPda,
      localDomain: localDomainPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([signer])
    .transaction()
}

/**
 * Add a device for a beneficiary and send via RPC
 */
export async function addDeviceForRpc(
  params: AddDeviceForParams,
): Promise<string> {
  const {
    program,
    caller,
    signer,
    beneficiary,
    deviceModelPda,
    devicePda,
    deviceLocationPda,
    localDomainPda,
    name,
    height,
    latitude,
    longitude,
    placement,
    macAddress,
    localDomain,
  } = params

  return program.methods
    .addDeviceFor(
      name,
      height,
      latitude,
      longitude,
      placement,
      macAddress,
      localDomain,
    )
    .accountsStrict({
      caller,
      beneficiary,
      deviceModel: deviceModelPda,
      device: devicePda,
      deviceLocation: deviceLocationPda,
      localDomain: localDomainPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for verifying device location
 */
export interface VerifyDeviceLocationParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  configPda: PublicKey
  devicePda: PublicKey
  deviceLocationPda: PublicKey
}

/**
 * Verify a device location
 * Returns the transaction for signing/confirmation
 */
export async function verifyDeviceLocationTx(
  params: VerifyDeviceLocationParams,
): Promise<anchor.web3.Transaction> {
  const { program, caller, signer, configPda, devicePda, deviceLocationPda } =
    params

  return program.methods
    .verifyDeviceLocation()
    .accountsPartial({
      caller,
      config: configPda,
      device: devicePda,
      deviceLocation: deviceLocationPda,
    })
    .signers([signer])
    .transaction()
}

/**
 * Verify a device location and send via RPC
 */
export async function verifyDeviceLocationRpc(
  params: VerifyDeviceLocationParams,
): Promise<string> {
  const { program, caller, signer, configPda, devicePda, deviceLocationPda } =
    params

  return program.methods
    .verifyDeviceLocation()
    .accountsPartial({
      caller,
      config: configPda,
      device: devicePda,
      deviceLocation: deviceLocationPda,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for adding a service agreement
 */
export interface AddServiceAgreementParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  configPda: PublicKey
  serviceAgreementPda: PublicKey
  threshold: BN
  payoutRatio: BN
}

/**
 * Add a service agreement
 * Returns the transaction for signing/confirmation
 */
export async function addServiceAgreementTx(
  params: AddServiceAgreementParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    caller,
    signer,
    configPda,
    serviceAgreementPda,
    threshold,
    payoutRatio,
  } = params

  return program.methods
    .addServiceAgreement(threshold, payoutRatio)
    .accountsPartial({
      caller,
      config: configPda,
      serviceAgreement: serviceAgreementPda,
    })
    .signers([signer])
    .transaction()
}

/**
 * Add a service agreement and send via RPC
 */
export async function addServiceAgreementRpc(
  params: AddServiceAgreementParams,
): Promise<string> {
  const {
    program,
    caller,
    signer,
    configPda,
    serviceAgreementPda,
    threshold,
    payoutRatio,
  } = params

  return program.methods
    .addServiceAgreement(threshold, payoutRatio)
    .accountsPartial({
      caller,
      config: configPda,
      serviceAgreement: serviceAgreementPda,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for adding an L3 plan
 */
export interface AddL3PlanParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  localDomainPda: PublicKey
  serviceAgreementPda: PublicKey
  planPda: PublicKey
  distributionDomainPda: PublicKey
  name: string
  price: BN
  duration: number
  speed: number
  capacity: BN
  startAt: BN | null
  authMethods?: PublicKey[]
}

/**
 * Add an L3 plan
 * Returns the transaction for signing/confirmation
 */
export async function addL3PlanTx(
  params: AddL3PlanParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    caller,
    signer,
    localDomainPda,
    serviceAgreementPda,
    planPda,
    distributionDomainPda,
    name,
    price,
    duration,
    speed,
    capacity,
    startAt,
    authMethods = [],
  } = params

  return program.methods
    .addL3Plan(name, price, duration, speed, capacity, startAt)
    .accountsStrict({
      caller,
      localDomain: localDomainPda,
      serviceAgreement: serviceAgreementPda,
      plan: planPda,
      distributionDomain: distributionDomainPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .remainingAccounts(
      authMethods.map((pubkey) => ({
        pubkey,
        isWritable: false,
        isSigner: false,
      })),
    )
    .signers([signer])
    .transaction()
}

/**
 * Add an L3 plan and send via RPC
 */
export async function addL3PlanRpc(params: AddL3PlanParams): Promise<string> {
  const {
    program,
    caller,
    signer,
    localDomainPda,
    serviceAgreementPda,
    planPda,
    distributionDomainPda,
    name,
    price,
    duration,
    speed,
    capacity,
    startAt,
    authMethods = [],
  } = params

  return program.methods
    .addL3Plan(name, price, duration, speed, capacity, startAt)
    .accountsStrict({
      caller,
      localDomain: localDomainPda,
      serviceAgreement: serviceAgreementPda,
      plan: planPda,
      distributionDomain: distributionDomainPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .remainingAccounts(
      authMethods.map((pubkey) => ({
        pubkey,
        isWritable: false,
        isSigner: false,
      })),
    )
    .signers([signer])
    .rpc()
}

/**
 * Parameters for adding an L2 plan
 */
export interface AddL2PlanParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  localDomainPda: PublicKey
  serviceAgreementPda: PublicKey
  parentPlanPda: PublicKey
  planPda: PublicKey
  accessDomainPda: PublicKey
  name: string
  price: BN
  duration: number
  speed: number
  capacity: BN
  startAt: BN | null
  authMethods?: PublicKey[]
}

/**
 * Add an L2 plan
 * Returns the transaction for signing/confirmation
 */
export async function addL2PlanTx(
  params: AddL2PlanParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    caller,
    signer,
    localDomainPda,
    serviceAgreementPda,
    parentPlanPda,
    planPda,
    accessDomainPda,
    name,
    price,
    duration,
    speed,
    capacity,
    startAt,
    authMethods = [],
  } = params

  return program.methods
    .addL2Plan(name, price, duration, speed, capacity, startAt)
    .accountsStrict({
      caller,
      localDomain: localDomainPda,
      serviceAgreement: serviceAgreementPda,
      parentPlan: parentPlanPda,
      plan: planPda,
      accessDomain: accessDomainPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .remainingAccounts(
      authMethods.map((pubkey) => ({
        pubkey,
        isWritable: false,
        isSigner: false,
      })),
    )
    .signers([signer])
    .transaction()
}

/**
 * Add an L2 plan and send via RPC
 */
export async function addL2PlanRpc(params: AddL2PlanParams): Promise<string> {
  const {
    program,
    caller,
    signer,
    localDomainPda,
    serviceAgreementPda,
    parentPlanPda,
    planPda,
    accessDomainPda,
    name,
    price,
    duration,
    speed,
    capacity,
    startAt,
    authMethods = [],
  } = params

  return program.methods
    .addL2Plan(name, price, duration, speed, capacity, startAt)
    .accountsStrict({
      caller,
      localDomain: localDomainPda,
      serviceAgreement: serviceAgreementPda,
      parentPlan: parentPlanPda,
      plan: planPda,
      accessDomain: accessDomainPda,
      systemProgram: anchor.web3.SystemProgram.programId,
    })
    .remainingAccounts(
      authMethods.map((pubkey) => ({
        pubkey,
        isWritable: false,
        isSigner: false,
      })),
    )
    .signers([signer])
    .rpc()
}

/**
 * Parameters for registering an auth method.
 *
 * Schema migration (access-domain redesign):
 *   - The AuthMethod is now keyed on (access_domain, method_type),
 *     not (authority, method_type, device, encryption_key, hash(params)).
 *   - encryption_key is no longer stored on AuthMethod; sealed
 *     credential payloads are decrypted via
 *     `access_domain.control_plane_device.owner` instead.
 *   - The caller must equal `access_domain.owner`.
 */
export interface RegisterAuthMethodParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  accessDomainPda: PublicKey
  authMethodPda: PublicKey
  authMethodType: AuthMethodType
  parameters: Uint8Array
}

/**
 * Register an auth method
 * Returns the transaction for signing/confirmation
 */
export async function registerAuthMethodTx(
  params: RegisterAuthMethodParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    caller,
    signer,
    accessDomainPda,
    authMethodPda,
    authMethodType,
    parameters,
  } = params

  return program.methods
    .registerAuthMethod(authMethodType, Array.from(parameters))
    .accountsPartial({
      caller,
      accessDomain: accessDomainPda,
      authMethod: authMethodPda,
    })
    .signers([signer])
    .transaction()
}

/**
 * Register an auth method and send via RPC
 */
export async function registerAuthMethodRpc(
  params: RegisterAuthMethodParams,
): Promise<string> {
  const {
    program,
    caller,
    signer,
    accessDomainPda,
    authMethodPda,
    authMethodType,
    parameters,
  } = params

  return program.methods
    .registerAuthMethod(authMethodType, Array.from(parameters))
    .accountsPartial({
      caller,
      accessDomain: accessDomainPda,
      authMethod: authMethodPda,
    })
    .signers([signer])
    .rpc()
}

// Note: addAuthMethodToPlan{Tx,Rpc} were removed along with the
// `add_auth_method` instruction. Plan.auth_methods is gone (one
// AuthMethod per AccessDomain, implicit via Plan.access_domain).
// Use registerAuthMethod{Tx,Rpc} on the AccessDomain directly.

/**
 * Parameters for subscribing to a plan
 */
export interface SubscribeParams {
  program: Program<Dawn>
  minDawnOut: BN
  deadline: BN
  caller: PublicKey
  signer: Keypair
  config: PublicKey
  plan: PublicKey
  device: PublicKey | null
  subscription: PublicKey
  stableMint: PublicKey
  dawnMint: PublicKey
  raydium: PublicKey
  raydiumAuthority: PublicKey
  raydiumConfig: PublicKey
  raydiumPool: PublicKey
  raydiumObservation: PublicKey
  raydiumDawnVault: PublicKey
  raydiumStableVault: PublicKey
  userStableAccount: PublicKey
  userDawnAccount: PublicKey
  feePoolDawnAccount: PublicKey
  escrowStableVault: PublicKey
  escrowDawnVault: PublicKey
  tokenProgram: PublicKey
  associatedTokenProgram: PublicKey
  systemProgram: PublicKey
}

/**
 * Subscribe to a plan
 * Returns the transaction for signing/confirmation
 */
export async function subscribeTx(
  params: SubscribeParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    minDawnOut,
    deadline,
    caller,
    signer,
    config,
    plan,
    device,
    subscription,
    stableMint,
    dawnMint,
    raydium,
    raydiumAuthority,
    raydiumConfig,
    raydiumPool,
    raydiumObservation,
    raydiumDawnVault,
    raydiumStableVault,
    userStableAccount,
    userDawnAccount,
    feePoolDawnAccount,
    escrowStableVault,
    escrowDawnVault,
    tokenProgram,
    associatedTokenProgram,
    systemProgram,
  } = params

  return program.methods
    .subscribe(minDawnOut, deadline)
    .accountsPartial({
      caller,
      config,
      plan,
      device,
      subscription,
      stableMint,
      dawnMint,
      raydium,
      raydiumAuthority,
      raydiumConfig,
      raydiumPool,
      raydiumObservation,
      raydiumDawnVault,
      raydiumStableVault,
      userStableAccount,
      userDawnAccount,
      feePoolDawnAccount,
      escrowStableVault,
      escrowDawnVault,
      tokenProgram,
      associatedTokenProgram,
      systemProgram,
    })
    .signers([signer])
    .transaction()
}

/**
 * Subscribe to a plan and send via RPC
 */
export async function subscribeRpc(params: SubscribeParams): Promise<string> {
  const {
    program,
    minDawnOut,
    deadline,
    caller,
    signer,
    config,
    plan,
    device,
    subscription,
    stableMint,
    dawnMint,
    raydium,
    raydiumAuthority,
    raydiumConfig,
    raydiumPool,
    raydiumObservation,
    raydiumDawnVault,
    raydiumStableVault,
    userStableAccount,
    userDawnAccount,
    feePoolDawnAccount,
    escrowStableVault,
    escrowDawnVault,
    tokenProgram,
    associatedTokenProgram,
    systemProgram,
  } = params

  return program.methods
    .subscribe(minDawnOut, deadline)
    .accountsPartial({
      caller,
      config,
      plan,
      device,
      subscription,
      stableMint,
      dawnMint,
      raydium,
      raydiumAuthority,
      raydiumConfig,
      raydiumPool,
      raydiumObservation,
      raydiumDawnVault,
      raydiumStableVault,
      userStableAccount,
      userDawnAccount,
      feePoolDawnAccount,
      escrowStableVault,
      escrowDawnVault,
      tokenProgram,
      associatedTokenProgram,
      systemProgram,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for extending a subscription
 */
export interface ExtendSubscriptionParams {
  program: Program<Dawn>
  minDawnOut: BN
  deadline: BN
  caller: PublicKey
  signer: Keypair
  config: PublicKey
  plan: PublicKey
  subscription: PublicKey
  stableMint: PublicKey
  dawnMint: PublicKey
  raydium: PublicKey
  raydiumAuthority: PublicKey
  raydiumConfig: PublicKey
  raydiumPool: PublicKey
  raydiumObservation: PublicKey
  raydiumDawnVault: PublicKey
  raydiumStableVault: PublicKey
  userStableAccount: PublicKey
  userDawnAccount: PublicKey
  feePoolDawnAccount: PublicKey
  escrowStableVault: PublicKey
  escrowDawnVault: PublicKey
  tokenProgram: PublicKey
  associatedTokenProgram: PublicKey
  systemProgram: PublicKey
}

/**
 * Extend a subscription
 * Returns the transaction for signing/confirmation
 */
export async function extendSubscriptionTx(
  params: ExtendSubscriptionParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    minDawnOut,
    deadline,
    caller,
    signer,
    config,
    plan,
    subscription,
    stableMint,
    dawnMint,
    raydium,
    raydiumAuthority,
    raydiumConfig,
    raydiumPool,
    raydiumObservation,
    raydiumDawnVault,
    raydiumStableVault,
    userStableAccount,
    userDawnAccount,
    feePoolDawnAccount,
    escrowStableVault,
    escrowDawnVault,
    tokenProgram,
    associatedTokenProgram,
    systemProgram,
  } = params

  return program.methods
    .extendSubscription(minDawnOut, deadline)
    .accountsPartial({
      caller,
      config,
      plan,
      subscription,
      stableMint,
      dawnMint,
      raydium,
      raydiumAuthority,
      raydiumConfig,
      raydiumPool,
      raydiumObservation,
      raydiumDawnVault,
      raydiumStableVault,
      userStableAccount,
      userDawnAccount,
      feePoolDawnAccount,
      escrowStableVault,
      escrowDawnVault,
      tokenProgram,
      associatedTokenProgram,
      systemProgram,
    })
    .signers([signer])
    .transaction()
}

/**
 * Extend a subscription and send via RPC
 */
export async function extendSubscriptionRpc(
  params: ExtendSubscriptionParams,
): Promise<string> {
  const {
    program,
    minDawnOut,
    deadline,
    caller,
    signer,
    config,
    plan,
    subscription,
    stableMint,
    dawnMint,
    raydium,
    raydiumAuthority,
    raydiumConfig,
    raydiumPool,
    raydiumObservation,
    raydiumDawnVault,
    raydiumStableVault,
    userStableAccount,
    userDawnAccount,
    feePoolDawnAccount,
    escrowStableVault,
    escrowDawnVault,
    tokenProgram,
    associatedTokenProgram,
    systemProgram,
  } = params

  return program.methods
    .extendSubscription(minDawnOut, deadline)
    .accountsPartial({
      caller,
      config,
      plan,
      subscription,
      stableMint,
      dawnMint,
      raydium,
      raydiumAuthority,
      raydiumConfig,
      raydiumPool,
      raydiumObservation,
      raydiumDawnVault,
      raydiumStableVault,
      userStableAccount,
      userDawnAccount,
      feePoolDawnAccount,
      escrowStableVault,
      escrowDawnVault,
      tokenProgram,
      associatedTokenProgram,
      systemProgram,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for subscribing to a plan for a beneficiary
 */
export interface SubscribeForParams {
  program: Program<Dawn>
  minDawnOut: BN
  deadline: BN
  caller: PublicKey
  signer: Keypair
  beneficiary: PublicKey
  config: PublicKey
  plan: PublicKey
  device: PublicKey | null
  subscription: PublicKey
  stableMint: PublicKey
  dawnMint: PublicKey
  raydium: PublicKey
  raydiumAuthority: PublicKey
  raydiumConfig: PublicKey
  raydiumPool: PublicKey
  raydiumObservation: PublicKey
  raydiumDawnVault: PublicKey
  raydiumStableVault: PublicKey
  userStableAccount: PublicKey
  userDawnAccount: PublicKey
  feePoolDawnAccount: PublicKey
  escrowStableVault: PublicKey
  escrowDawnVault: PublicKey
  tokenProgram: PublicKey
  associatedTokenProgram: PublicKey
  systemProgram: PublicKey
}

/**
 * Subscribe to a plan for a beneficiary
 * Returns the transaction for signing/confirmation
 */
export async function subscribeForTx(
  params: SubscribeForParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    minDawnOut,
    deadline,
    caller,
    signer,
    beneficiary,
    config,
    plan,
    device,
    subscription,
    stableMint,
    dawnMint,
    raydium,
    raydiumAuthority,
    raydiumConfig,
    raydiumPool,
    raydiumObservation,
    raydiumDawnVault,
    raydiumStableVault,
    userStableAccount,
    userDawnAccount,
    feePoolDawnAccount,
    escrowStableVault,
    escrowDawnVault,
    tokenProgram,
    associatedTokenProgram,
    systemProgram,
  } = params

  return program.methods
    .subscribeFor(minDawnOut, deadline)
    .accountsPartial({
      caller,
      beneficiary,
      config,
      plan,
      device,
      subscription,
      stableMint,
      dawnMint,
      raydium,
      raydiumAuthority,
      raydiumConfig,
      raydiumPool,
      raydiumObservation,
      raydiumDawnVault,
      raydiumStableVault,
      userStableAccount,
      userDawnAccount,
      feePoolDawnAccount,
      escrowStableVault,
      escrowDawnVault,
      tokenProgram,
      associatedTokenProgram,
      systemProgram,
    })
    .signers([signer])
    .transaction()
}

/**
 * Subscribe to a plan for a beneficiary and send via RPC
 */
export async function subscribeForRpc(
  params: SubscribeForParams,
): Promise<string> {
  const {
    program,
    minDawnOut,
    deadline,
    caller,
    signer,
    beneficiary,
    config,
    plan,
    device,
    subscription,
    stableMint,
    dawnMint,
    raydium,
    raydiumAuthority,
    raydiumConfig,
    raydiumPool,
    raydiumObservation,
    raydiumDawnVault,
    raydiumStableVault,
    userStableAccount,
    userDawnAccount,
    feePoolDawnAccount,
    escrowStableVault,
    escrowDawnVault,
    tokenProgram,
    associatedTokenProgram,
    systemProgram,
  } = params

  return program.methods
    .subscribeFor(minDawnOut, deadline)
    .accountsPartial({
      caller,
      beneficiary,
      config,
      plan,
      device,
      subscription,
      stableMint,
      dawnMint,
      raydium,
      raydiumAuthority,
      raydiumConfig,
      raydiumPool,
      raydiumObservation,
      raydiumDawnVault,
      raydiumStableVault,
      userStableAccount,
      userDawnAccount,
      feePoolDawnAccount,
      escrowStableVault,
      escrowDawnVault,
      tokenProgram,
      associatedTokenProgram,
      systemProgram,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for extending a subscription for a beneficiary
 */
export interface ExtendSubscriptionForParams {
  program: Program<Dawn>
  minDawnOut: BN
  deadline: BN
  caller: PublicKey
  signer: Keypair
  beneficiary: PublicKey
  config: PublicKey
  plan: PublicKey
  subscription: PublicKey
  stableMint: PublicKey
  dawnMint: PublicKey
  raydium: PublicKey
  raydiumAuthority: PublicKey
  raydiumConfig: PublicKey
  raydiumPool: PublicKey
  raydiumObservation: PublicKey
  raydiumDawnVault: PublicKey
  raydiumStableVault: PublicKey
  userStableAccount: PublicKey
  userDawnAccount: PublicKey
  feePoolDawnAccount: PublicKey
  escrowStableVault: PublicKey
  escrowDawnVault: PublicKey
  tokenProgram: PublicKey
  associatedTokenProgram: PublicKey
  systemProgram: PublicKey
}

/**
 * Extend a subscription for a beneficiary
 * Returns the transaction for signing/confirmation
 */
export async function extendSubscriptionForTx(
  params: ExtendSubscriptionForParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    minDawnOut,
    deadline,
    caller,
    signer,
    beneficiary,
    config,
    plan,
    subscription,
    stableMint,
    dawnMint,
    raydium,
    raydiumAuthority,
    raydiumConfig,
    raydiumPool,
    raydiumObservation,
    raydiumDawnVault,
    raydiumStableVault,
    userStableAccount,
    userDawnAccount,
    feePoolDawnAccount,
    escrowStableVault,
    escrowDawnVault,
    tokenProgram,
    associatedTokenProgram,
    systemProgram,
  } = params

  return program.methods
    .extendSubscriptionFor(minDawnOut, deadline)
    .accountsPartial({
      caller,
      beneficiary,
      config,
      plan,
      subscription,
      stableMint,
      dawnMint,
      raydium,
      raydiumAuthority,
      raydiumConfig,
      raydiumPool,
      raydiumObservation,
      raydiumDawnVault,
      raydiumStableVault,
      userStableAccount,
      userDawnAccount,
      feePoolDawnAccount,
      escrowStableVault,
      escrowDawnVault,
      tokenProgram,
      associatedTokenProgram,
      systemProgram,
    })
    .signers([signer])
    .transaction()
}

/**
 * Extend a subscription for a beneficiary and send via RPC
 */
export async function extendSubscriptionForRpc(
  params: ExtendSubscriptionForParams,
): Promise<string> {
  const {
    program,
    minDawnOut,
    deadline,
    caller,
    signer,
    beneficiary,
    config,
    plan,
    subscription,
    stableMint,
    dawnMint,
    raydium,
    raydiumAuthority,
    raydiumConfig,
    raydiumPool,
    raydiumObservation,
    raydiumDawnVault,
    raydiumStableVault,
    userStableAccount,
    userDawnAccount,
    feePoolDawnAccount,
    escrowStableVault,
    escrowDawnVault,
    tokenProgram,
    associatedTokenProgram,
    systemProgram,
  } = params

  return program.methods
    .extendSubscriptionFor(minDawnOut, deadline)
    .accountsPartial({
      caller,
      beneficiary,
      config,
      plan,
      subscription,
      stableMint,
      dawnMint,
      raydium,
      raydiumAuthority,
      raydiumConfig,
      raydiumPool,
      raydiumObservation,
      raydiumDawnVault,
      raydiumStableVault,
      userStableAccount,
      userDawnAccount,
      feePoolDawnAccount,
      escrowStableVault,
      escrowDawnVault,
      tokenProgram,
      associatedTokenProgram,
      systemProgram,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for claiming DAWN from a subscription
 */
export interface ClaimParams {
  program: Program<Dawn>
  minDawnOut: BN
  deadline: BN
  caller: PublicKey
  signer: Keypair
  config: PublicKey
  plan: PublicKey
  subscription: PublicKey
  stableMint: PublicKey
  dawnMint: PublicKey
  raydium: PublicKey
  raydiumAuthority: PublicKey
  raydiumConfig: PublicKey
  raydiumPool: PublicKey
  raydiumObservation: PublicKey
  raydiumDawnVault: PublicKey
  raydiumStableVault: PublicKey
  escrowStableVault: PublicKey
  escrowDawnVault: PublicKey
  serviceProviderDawnAccount: PublicKey
  tokenProgram: PublicKey
  associatedTokenProgram: PublicKey
  systemProgram: PublicKey
}

/**
 * Claim DAWN from a subscription
 * Returns the transaction for signing/confirmation
 */
export async function claimTx(
  params: ClaimParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    minDawnOut,
    deadline,
    caller,
    signer,
    config,
    plan,
    subscription,
    stableMint,
    dawnMint,
    raydium,
    raydiumAuthority,
    raydiumConfig,
    raydiumPool,
    raydiumObservation,
    raydiumDawnVault,
    raydiumStableVault,
    escrowStableVault,
    escrowDawnVault,
    serviceProviderDawnAccount,
    tokenProgram,
    associatedTokenProgram,
    systemProgram,
  } = params

  return program.methods
    .claim(minDawnOut, deadline)
    .accountsPartial({
      caller,
      config,
      plan,
      subscription,
      stableMint,
      dawnMint,
      raydium,
      raydiumAuthority,
      raydiumConfig,
      raydiumPool,
      raydiumObservation,
      raydiumDawnVault,
      raydiumStableVault,
      escrowStableVault,
      escrowDawnVault,
      serviceProviderDawnAccount,
      tokenProgram,
      associatedTokenProgram,
      systemProgram,
    })
    .signers([signer])
    .transaction()
}

/**
 * Claim DAWN from a subscription and send via RPC
 */
export async function claimRpc(params: ClaimParams): Promise<string> {
  const {
    program,
    minDawnOut,
    deadline,
    caller,
    signer,
    config,
    plan,
    subscription,
    stableMint,
    dawnMint,
    raydium,
    raydiumAuthority,
    raydiumConfig,
    raydiumPool,
    raydiumObservation,
    raydiumDawnVault,
    raydiumStableVault,
    escrowStableVault,
    escrowDawnVault,
    serviceProviderDawnAccount,
    tokenProgram,
    associatedTokenProgram,
    systemProgram,
  } = params

  return program.methods
    .claim(minDawnOut, deadline)
    .accountsPartial({
      caller,
      config,
      plan,
      subscription,
      stableMint,
      dawnMint,
      raydium,
      raydiumAuthority,
      raydiumConfig,
      raydiumPool,
      raydiumObservation,
      raydiumDawnVault,
      raydiumStableVault,
      escrowStableVault,
      escrowDawnVault,
      serviceProviderDawnAccount,
      tokenProgram,
      associatedTokenProgram,
      systemProgram,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for the customer-self-mint credential flow.
 *
 * Schema migration:
 *   - Args changed from `credential_data: [u8; 128]` to
 *     `(vlan_id: Option<u16>, qos_tag: Option<u8>, sealed_payload: [u8; 128])`.
 *   - Credential PDA seeds changed to `(access_domain, auth_method,
 *     beneficiary)` — `subscription` and `plan` are no longer in the PDA
 *     seeds, but are stored on the Credential as `Some(...)` for the
 *     plan-attached path.
 *   - `sealed_payload` is a libsodium sealed-box encrypted to
 *     `access_domain.control_plane_device.owner`. See
 *     docs/sot-bridge-protocol.md §6.
 */
export interface RegisterCredentialParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  accessDomainPda: PublicKey
  authMethodPda: PublicKey
  planPda: PublicKey
  subscriptionPda: PublicKey
  credentialPda: PublicKey
  vlanId: number | null
  qosTag: number | null
  sealedPayload: number[]
}

export async function registerCredentialTx(
  params: RegisterCredentialParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    caller,
    signer,
    accessDomainPda,
    authMethodPda,
    planPda,
    subscriptionPda,
    credentialPda,
    vlanId,
    qosTag,
    sealedPayload,
  } = params

  return program.methods
    .registerCredential(vlanId, qosTag, sealedPayload)
    .accountsPartial({
      caller,
      accessDomain: accessDomainPda,
      authMethod: authMethodPda,
      plan: planPda,
      subscription: subscriptionPda,
      credential: credentialPda,
    })
    .signers([signer])
    .transaction()
}

export async function registerCredentialRpc(
  params: RegisterCredentialParams,
): Promise<string> {
  const {
    program,
    caller,
    signer,
    accessDomainPda,
    authMethodPda,
    planPda,
    subscriptionPda,
    credentialPda,
    vlanId,
    qosTag,
    sealedPayload,
  } = params

  return program.methods
    .registerCredential(vlanId, qosTag, sealedPayload)
    .accountsPartial({
      caller,
      accessDomain: accessDomainPda,
      authMethod: authMethodPda,
      plan: planPda,
      subscription: subscriptionPda,
      credential: credentialPda,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for revoking a credential.
 *
 * Schema migration: subscription/plan are no longer in the Credential's
 * PDA seeds and are not part of `revoke_credential`'s account context.
 * Caller must equal `credential.authority` OR `access_domain.owner`.
 */
export interface RevokeCredentialParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  accessDomainPda: PublicKey
  authMethodPda: PublicKey
  credentialPda: PublicKey
}

export async function revokeCredentialTx(
  params: RevokeCredentialParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    caller,
    signer,
    accessDomainPda,
    authMethodPda,
    credentialPda,
  } = params

  return program.methods
    .revokeCredential()
    .accountsPartial({
      caller,
      accessDomain: accessDomainPda,
      authMethod: authMethodPda,
      credential: credentialPda,
    })
    .signers([signer])
    .transaction()
}

export async function revokeCredentialRpc(
  params: RevokeCredentialParams,
): Promise<string> {
  const {
    program,
    caller,
    signer,
    accessDomainPda,
    authMethodPda,
    credentialPda,
  } = params

  return program.methods
    .revokeCredential()
    .accountsPartial({
      caller,
      accessDomain: accessDomainPda,
      authMethod: authMethodPda,
      credential: credentialPda,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for registering a connection
 */
export interface RegisterConnectionParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  authMethodPda: PublicKey
  connectionPda: PublicKey
  entityA: PublicKey
  entityB: PublicKey
  credentialDataA: number[]
  credentialDataB: number[]
  systemProgram?: PublicKey
}

/**
 * Register a connection
 * Returns the transaction for signing/confirmation
 */
export async function registerConnectionTx(
  params: RegisterConnectionParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    caller,
    signer,
    authMethodPda,
    connectionPda,
    entityA,
    entityB,
    credentialDataA,
    credentialDataB,
    systemProgram,
  } = params

  return program.methods
    .registerConnection(entityA, entityB, credentialDataA, credentialDataB)
    .accountsPartial({
      caller,
      authMethod: authMethodPda,
      connection: connectionPda,
      systemProgram: systemProgram || anchor.web3.SystemProgram.programId,
    })
    .signers([signer])
    .transaction()
}

/**
 * Register a connection and send via RPC
 */
export async function registerConnectionRpc(
  params: RegisterConnectionParams,
): Promise<string> {
  const {
    program,
    caller,
    signer,
    authMethodPda,
    connectionPda,
    entityA,
    entityB,
    credentialDataA,
    credentialDataB,
    systemProgram,
  } = params

  return program.methods
    .registerConnection(entityA, entityB, credentialDataA, credentialDataB)
    .accountsPartial({
      caller,
      authMethod: authMethodPda,
      connection: connectionPda,
      systemProgram: systemProgram || anchor.web3.SystemProgram.programId,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for revoking a connection
 */
export interface RevokeConnectionParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  authMethodPda: PublicKey
  connectionPda: PublicKey
}

/**
 * Revoke a connection
 * Returns the transaction for signing/confirmation
 */
export async function revokeConnectionTx(
  params: RevokeConnectionParams,
): Promise<anchor.web3.Transaction> {
  const { program, caller, signer, authMethodPda, connectionPda } = params

  return program.methods
    .revokeConnection()
    .accountsPartial({
      caller,
      authMethod: authMethodPda,
      connection: connectionPda,
    })
    .signers([signer])
    .transaction()
}

/**
 * Revoke a connection and send via RPC
 */
export async function revokeConnectionRpc(
  params: RevokeConnectionParams,
): Promise<string> {
  const { program, caller, signer, authMethodPda, connectionPda } = params

  return program.methods
    .revokeConnection()
    .accountsPartial({
      caller,
      authMethod: authMethodPda,
      connection: connectionPda,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for leasing subscription IP
 */
export interface LeaseSubscriptionIpParams {
  program: Program<Dawn>
  caller: PublicKey
  signer: Keypair
  devicePda?: PublicKey // Optional for mobile subscribers without devices
  ipRegistry: PublicKey
  rootIpBlock: PublicKey
  ipBlock: PublicKey
  ipLease: PublicKey
  subscription: PublicKey
  systemProgram?: PublicKey
}

/**
 * Lease subscription IP
 * Returns the transaction for signing/confirmation
 */
export async function leaseSubscriptionIpTx(
  params: LeaseSubscriptionIpParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    caller,
    signer,
    devicePda,
    ipRegistry,
    rootIpBlock,
    ipBlock,
    ipLease,
    subscription,
    systemProgram,
  } = params

  const accounts: any = {
    caller,
    ipRegistry,
    rootIpBlock,
    ipBlock,
    ipLease,
    subscription,
    systemProgram: systemProgram || anchor.web3.SystemProgram.programId,
  }

  // Add device if provided (optional for mobile subscribers)
  if (devicePda) {
    accounts.device = devicePda
  }

  return program.methods
    .leaseSubscriptionIp()
    .accountsPartial(accounts)
    .signers([signer])
    .transaction()
}

/**
 * Lease subscription IP and send via RPC
 */
export async function leaseSubscriptionIpRpc(
  params: LeaseSubscriptionIpParams,
): Promise<string> {
  const {
    program,
    caller,
    signer,
    devicePda,
    ipRegistry,
    rootIpBlock,
    ipBlock,
    ipLease,
    subscription,
    systemProgram,
  } = params

  const accounts: any = {
    caller,
    ipRegistry,
    rootIpBlock,
    ipBlock,
    ipLease,
    subscription,
    systemProgram: systemProgram || anchor.web3.SystemProgram.programId,
  }

  // Add device if provided (optional for mobile subscribers)
  if (devicePda) {
    accounts.device = devicePda
  }

  return program.methods
    .leaseSubscriptionIp()
    .accountsPartial(accounts)
    .signers([signer])
    .rpc()
}

/**
 * Parameters for allocating IP
 */
export interface AllocateIpParams {
  program: Program<Dawn>
  tier: number
  authority: PublicKey
  signer: Keypair
  devicePda: PublicKey
  ipRegistry: PublicKey
  rootIpBlock: PublicKey
  ipBlock: PublicKey
  ipLease: PublicKey
  systemProgram?: PublicKey
}

/**
 * Allocate IP
 * Returns the transaction for signing/confirmation
 */
export async function allocateIpTx(
  params: AllocateIpParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    tier,
    authority,
    signer,
    devicePda,
    ipRegistry,
    rootIpBlock,
    ipBlock,
    ipLease,
    systemProgram,
  } = params

  return program.methods
    .allocateIp(tier)
    .accountsPartial({
      authority,
      device: devicePda,
      ipRegistry,
      rootIpBlock,
      ipBlock,
      ipLease,
      systemProgram: systemProgram || anchor.web3.SystemProgram.programId,
    })
    .signers([signer])
    .transaction()
}

/**
 * Allocate IP and send via RPC
 */
export async function allocateIpRpc(params: AllocateIpParams): Promise<string> {
  const {
    program,
    tier,
    authority,
    signer,
    devicePda,
    ipRegistry,
    rootIpBlock,
    ipBlock,
    ipLease,
    systemProgram,
  } = params

  return program.methods
    .allocateIp(tier)
    .accountsPartial({
      authority,
      device: devicePda,
      ipRegistry,
      rootIpBlock,
      ipBlock,
      ipLease,
      systemProgram: systemProgram || anchor.web3.SystemProgram.programId,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for initializing root IP block
 */
export interface InitializeRootIpBlockParams {
  program: Program<Dawn>
  tier: number
  baseIpv4: number
  baseCidr: number
  caller: PublicKey
  signer: Keypair
  configPda: PublicKey
  authority: PublicKey
  systemProgram?: PublicKey
}

/**
 * Initialize root IP block
 * Returns the transaction for signing/confirmation
 */
export async function initializeRootIpBlockTx(
  params: InitializeRootIpBlockParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    tier,
    baseIpv4,
    baseCidr,
    caller,
    signer,
    configPda,
    authority,
    systemProgram,
  } = params

  return program.methods
    .initializeRootIpBlock(tier, baseIpv4, baseCidr)
    .accountsPartial({
      caller,
      config: configPda,
      authority,
      systemProgram: systemProgram || anchor.web3.SystemProgram.programId,
    })
    .signers([signer])
    .transaction()
}

/**
 * Initialize root IP block and send via RPC
 */
export async function initializeRootIpBlockRpc(
  params: InitializeRootIpBlockParams,
): Promise<string> {
  const {
    program,
    tier,
    baseIpv4,
    baseCidr,
    caller,
    signer,
    configPda,
    authority,
    systemProgram,
  } = params

  return program.methods
    .initializeRootIpBlock(tier, baseIpv4, baseCidr)
    .accountsPartial({
      caller,
      config: configPda,
      authority,
      systemProgram: systemProgram || anchor.web3.SystemProgram.programId,
    })
    .signers([signer])
    .rpc()
}

/**
 * Parameters for revoking IP
 */
export interface RevokeIpParams {
  program: Program<Dawn>
  tier: number
  caller: PublicKey
  signer: Keypair
  ipRegistry: PublicKey
  rootIpBlock: PublicKey
  ipBlock: PublicKey
  ipLease: PublicKey
  systemProgram?: PublicKey
}

/**
 * Revoke IP
 * Returns the transaction for signing/confirmation
 */
export async function revokeIpTx(
  params: RevokeIpParams,
): Promise<anchor.web3.Transaction> {
  const {
    program,
    tier,
    caller,
    signer,
    ipRegistry,
    rootIpBlock,
    ipBlock,
    ipLease,
    systemProgram,
  } = params

  return program.methods
    .revokeIp(tier)
    .accountsPartial({
      caller,
      ipRegistry,
      rootIpBlock,
      ipBlock,
      ipLease,
      systemProgram: systemProgram || anchor.web3.SystemProgram.programId,
    })
    .signers([signer])
    .transaction()
}

/**
 * Revoke IP and send via RPC
 */
export async function revokeIpRpc(params: RevokeIpParams): Promise<string> {
  const {
    program,
    tier,
    caller,
    signer,
    ipRegistry,
    rootIpBlock,
    ipBlock,
    ipLease,
    systemProgram,
  } = params

  return program.methods
    .revokeIp(tier)
    .accountsPartial({
      caller,
      ipRegistry,
      rootIpBlock,
      ipBlock,
      ipLease,
      systemProgram: systemProgram || anchor.web3.SystemProgram.programId,
    })
    .signers([signer])
    .rpc()
}
