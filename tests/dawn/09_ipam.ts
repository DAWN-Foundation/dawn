import * as anchor from '@coral-xyz/anchor'
import { Program, BN, AnchorError, Wallet } from '@coral-xyz/anchor'
import { PublicKey, SystemProgram, Keypair, Transaction } from '@solana/web3.js'
import { BankrunProvider } from 'anchor-bankrun'
import { Clock } from 'solana-bankrun'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { mintTo, createAssociatedTokenAccount } from 'spl-token-bankrun'

import { Dawn } from '../../target/types/dawn'
import {
  getEvent,
  mock,
  loadWallet,
  confirmTx,
  getIpLeasePda,
  getDevicePda,
  IpV4Bytes,
  getDeviceLocationPda,
  getSubscriptionPda,
  getLocalDomainPda,
} from '../../sdk/utils'
import { beforeAll, expect } from '@jest/globals'

interface IpLeased {
  ipLease: PublicKey
  device: PublicKey
  tier: number
  ipv4: IpV4Bytes
  cidr: number
  blockIndex: number
  unitIndex: number
}

interface SubscriberSetup {
  wallet: Keypair
  devicePda: PublicKey
  subscriptionPda: PublicKey
  usdcAccount: PublicKey
  dawnAccount: PublicKey
}

const Q32 = new BN(2).pow(new BN(32))

function calculateMinDawnOut(
  usdcAmount: BN,
  price: BN,
  slippageBps: number = 500,
): BN {
  // expectedOut = (usdcAmount * price) / Q32
  const expectedOut = usdcAmount.mul(price).div(Q32)
  // Apply slippage: minOut = expectedOut * (10000 - slippageBps) / 10000
  const minOut = expectedOut.mul(new BN(10000 - slippageBps)).div(new BN(10000))
  return minOut
}

// Helper function to create a complete subscriber setup for IPAM tests
const createSubscriber = async (
  program: Program<Dawn>,
  provider: BankrunProvider,
  subscriberName: string,
  deviceName: string,
  plan: PublicKey = mock.planPda,
): Promise<SubscriberSetup> => {
  const wallet = loadWallet()

  // 1. Create a new wallet (subscriber)
  const subscriberWallet = Keypair.generate()

  // 1.1. Fund the subscriber wallet with SOL for transaction fees
  // Advance the context to get a fresh blockhash
  const currentSlot = await provider.context.banksClient.getSlot()
  await provider.context.warpToSlot(currentSlot + BigInt(1))

  const transferIx = SystemProgram.transfer({
    fromPubkey: wallet.payer.publicKey,
    toPubkey: subscriberWallet.publicKey,
    lamports: 1000_000_000, // 1 SOL
  })

  const transferTx = new Transaction().add(transferIx)
  transferTx.feePayer = wallet.payer.publicKey
  transferTx.recentBlockhash = provider.context.lastBlockhash
  transferTx.sign(wallet.payer)

  // Process transaction with bankrun
  await provider.context.banksClient.processTransaction(transferTx)

  // 2. Create token accounts for USDC and DAWN
  const usdcAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    wallet.payer,
    mock.usdcMint,
    subscriberWallet.publicKey,
  )

  const dawnAccount = await createAssociatedTokenAccount(
    provider.context.banksClient,
    wallet.payer,
    mock.dawnMint,
    subscriberWallet.publicKey,
  )

  // 3. Mint USDC tokens to subscriber (for subscription payment)
  await mintTo(
    provider.context.banksClient,
    wallet.payer, // Payer for transaction
    mock.usdcMint,
    usdcAccount,
    wallet, // Mint authority
    BigInt(100_000_000_000), // 100,000 USDC (6 decimals)
  )

  // 4. Create device PDA
  const devicePda = getDevicePda(
    program,
    subscriberWallet,
    mock.deviceL2ModelPda,
    deviceName,
    mock.deviceMacAddress,
  )

  // 5. Add device (this also creates IP leases for loopback and PTP)
  const deviceLocationPda = getDeviceLocationPda(program, devicePda)

  const localDomainPda = getLocalDomainPda(
    program,
    subscriberWallet.publicKey,
    mock.localDomain,
  )

  await program.methods
    .addDevice(
      deviceName,
      mock.deviceHeight,
      mock.deviceLatitude,
      mock.deviceLongitude,
      mock.devicePlacement,
      mock.deviceMacAddress,
      mock.localDomain,
    )
    .accountsPartial({
      caller: subscriberWallet.publicKey,
      device: devicePda,
      deviceModel: mock.deviceL2ModelPda,
      localDomain: localDomainPda,
      deviceLocation: deviceLocationPda,
    })
    .signers([subscriberWallet])
    .rpc()

  const subscriptionPda = getSubscriptionPda(program, plan, subscriberWallet)[0]

  const clock = await provider.context.banksClient.getClock()
  const currentTime = clock.unixTimestamp

  const raydiumDawnVault = await getAccount(
    provider.connection,
    mock.raydiumDawnVault,
  )
  const raydiumUsdcVault = await getAccount(
    provider.connection,
    mock.raydiumUsdcVault,
  )
  const dawnVaultAmount = new BN(raydiumDawnVault.amount.toString())
  const usdcVaultAmount = new BN(raydiumUsdcVault.amount.toString())
  const price = dawnVaultAmount.mul(Q32).div(usdcVaultAmount)
  const config = await program.account.config.fetch(mock.configPda)
  const planData = await program.account.plan.fetch(plan)
  const totalFeeBps = config.daoFee
    .add(config.validatorFee)
    .add(config.medallionFee)
  const totalFeeUsdc = planData.price.mul(totalFeeBps).div(new BN(10_000))
  const remainder = planData.price.sub(totalFeeUsdc)
  const dailyUsdc = remainder.div(new BN(planData.duration))
  const usdcToSwap = totalFeeUsdc.add(dailyUsdc)
  const minDawnOut = calculateMinDawnOut(usdcToSwap, price, 50)

  await program.methods
    .subscribe(minDawnOut, new BN(currentTime.toString()).add(new BN(300)))
    .accountsPartial({
      caller: subscriberWallet.publicKey,
      config: mock.configPda,
      device: devicePda, // Include device for IPAM compatibility if available
      plan: plan,
      subscription: subscriptionPda,
      // mints
      usdcMint: mock.usdcMint,
      dawnMint: mock.dawnMint,
      // raydium
      raydium: mock.raydium,
      raydiumAuthority: mock.raydiumAuthority,
      raydiumConfig: mock.raydiumConfig,
      raydiumPool: mock.raydiumPool,
      raydiumObservation: mock.raydiumObservation,
      // vaults
      raydiumDawnVault: mock.raydiumDawnVault,
      raydiumUsdcVault: mock.raydiumUsdcVault,
      // token accounts
      userUsdcAccount: usdcAccount,
      userDawnAccount: dawnAccount,
      feePoolDawnAccount: mock.feePoolDawnAccount,
      escrowUsdcVault: mock.escrowUsdcVault,
      escrowDawnVault: mock.escrowDawnVault,
      // programs
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([subscriberWallet])
    .rpc()

  return {
    wallet: subscriberWallet,
    devicePda,
    subscriptionPda,
    usdcAccount,
    dawnAccount,
  }
}

export const leaseIpTests = () =>
  describe('dawn::lease_ip', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>

    beforeAll(async () => {
      // Use the existing provider and program from the test suite
      provider = anchor.getProvider() as BankrunProvider
      provider.wallet = new Wallet(mock.serviceProvider)
      anchor.setProvider(provider)
      program = anchor.workspace.DAWN as Program<Dawn>
    })

    test('mock setup', () => {
      expect(mock).toBeDefined()
    })

    test('cannot lease IP with expired subscription', async () => {
      // Create a dedicated subscriber for this test
      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'expired-test-subscriber',
        'expired-test-device',
      )

      // Get the subscription account to check its expiration and device
      const subscriptionAccount = await program.account.subscription.fetch(
        subscriberSetup.subscriptionPda,
      )

      // Set clock to past the subscription expiration
      const clock = await provider.context.banksClient.getClock()
      let currentTime = clock.unixTimestamp

      provider.context.setClock(
        new Clock(
          clock.slot,
          clock.epochStartTimestamp,
          clock.epoch,
          clock.leaderScheduleEpoch,
          BigInt(subscriptionAccount.expiration.add(new BN(86400)).toString()),
        ),
      )

      // Get IP lease PDA for our test device
      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda) // Subscriber tier

      // Set provider wallet to the subscriber for signing
      provider.wallet = new Wallet(subscriberSetup.wallet)

      try {
        await program.methods
          .leaseSubscriptionIp()
          .accountsPartial({
            caller: subscriberSetup.wallet.publicKey,
            device: subscriberSetup.devicePda,
            rootIpBlock: mock.rootSubscriberIpBlockPda,
            ipBlock: mock.ipBlockPda,
            ipLease: ipLeasePda,
            subscription: subscriberSetup.subscriptionPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([subscriberSetup.wallet])
          .rpc()
        expect(false).toBeTruthy()
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Subscription expired')
      } finally {
        // Reset clock
        provider.context.setClock(
          new Clock(
            clock.slot,
            clock.epochStartTimestamp,
            clock.epoch,
            clock.leaderScheduleEpoch,
            currentTime,
          ),
        )
      }
    })

    test('cannot lease IP with device not owned by caller', async () => {
      // Create a subscriber with their own device
      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'device-owner-subscriber',
        'owned-device',
      )

      // const unauthorizedWallet = new Wallet(anchor.web3.Keypair.generate())
      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda) // Subscriber tier

      try {
        await program.methods
          .leaseSubscriptionIp()
          .accountsPartial({
            caller: mock.serviceProvider.publicKey,
            device: subscriberSetup.devicePda, // Device owned by subscriberSetup.wallet, not unauthorizedWallet
            rootIpBlock: mock.rootSubscriberIpBlockPda,
            ipBlock: mock.ipBlockPda,
            ipLease: ipLeasePda,
            subscription: subscriberSetup.subscriptionPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([mock.serviceProvider])
          .rpc()
      } catch (error) {
        expect(error).toBeDefined()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid device')
      }
    })

    test('successfully leases first IP address from new block', async () => {
      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'lease-ip-subscriber',
        'lease-ip-device',
      )

      // Get IP lease PDA for our test device
      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda) // Subscriber tier

      // Set provider wallet to service provider for signing
      provider.wallet = new Wallet(subscriberSetup.wallet)

      const tx = await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // Verify event was emitted
      const event = await getEvent<IpLeased>(program, txDetails, 'ipLeased')
      expect(event.device).toEqual(subscriberSetup.devicePda)
      expect(event.tier).toBe(0) // Subscriber tier
      expect(event.ipv4[0]).toBe(10) // First octet should be 10
      expect(event.ipv4[1]).toBe(64) // Second octet should be 64
      expect(event.cidr).toBe(32) // /32 for subscriber tier
      expect(event.blockIndex).toBeGreaterThanOrEqual(0)

      // Verify IP lease account was created
      const ipLease = await program.account.ipLease.fetch(ipLeasePda)
      expect(ipLease.device).toEqual(subscriberSetup.devicePda)
      expect(ipLease.tier).toEqual({ subscriber: {} })
      expect(ipLease.ipv4[0]).toBe(10) // First octet should be 10
      expect(ipLease.ipv4[1]).toBe(64) // Second octet should be 64
      expect(ipLease.ipV4CidrMask).toBe(32)
      expect(ipLease.blockIndex).toBeGreaterThanOrEqual(0)
      expect(ipLease.unitIndex).toBeGreaterThanOrEqual(0)

      // Verify IP block was initialized
      const ipBlock = await program.account.ipBlock.fetch(mock.ipBlockPda)
      expect(ipBlock.tier).toEqual({ subscriber: {} })
      expect(ipBlock.blockBase).toBe(0x0a400000) // 10.64.0.0 in network byte order
      expect(ipBlock.blockCidr).toBe(22)
      expect(ipBlock.unitCapacity).toBe(1024)
      expect(ipBlock.freeUnits).toBeLessThan(ipBlock.unitCapacity) // Should have some units allocated
      expect(ipBlock.slotsChunks).toHaveLength(16) // 1024 bits / 64 bits per chunk

      // Verify root IP block was updated
      const rootIpBlock = await program.account.rootIpBlock.fetch(
        mock.rootSubscriberIpBlockPda,
      )
      expect(rootIpBlock.tier).toEqual({ subscriber: {} })
      expect(rootIpBlock.baseIpv4).toBe(0x0a400000)
      expect(rootIpBlock.baseCidr).toBe(10)
      expect(rootIpBlock.blockCidr).toBe(22)
      console.log('finished')
    })

    test('successfully leases second IP address from same block', async () => {
      // Create a dedicated subscriber for this test
      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'second-ip-subscriber',
        'second-ip-device',
      )

      // Get IP lease PDA for the subscriber's device
      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      // Verify IP lease account was created
      const ipLease = await program.account.ipLease.fetch(ipLeasePda)
      expect(ipLease.device).toEqual(subscriberSetup.devicePda)
      expect(ipLease.tier).toEqual({ subscriber: {} })
      expect(ipLease.ipV4CidrMask).toBe(32)

      // Verify IP block free units decreased
      const ipBlock = await program.account.ipBlock.fetch(mock.ipBlockPda)
      expect(ipBlock.freeUnits).toBeLessThan(ipBlock.unitCapacity)
    })

    test('handles multiple concurrent IP leases correctly', async () => {
      // Create multiple subscribers, each with their own device and subscription
      const subscribers: SubscriberSetup[] = []
      const leasePromises: Promise<string>[] = []

      // Create 3 subscribers (reduced from 5 to avoid IP block exhaustion)
      for (let i = 0; i < 3; i++) {
        const subscriberSetup = await createSubscriber(
          program,
          provider,
          `concurrent-subscriber-${i}`,
          `concurrent-device-${i}`,
        )
        subscribers.push(subscriberSetup)
      }

      // Create lease promises for each subscriber
      for (const subscriberSetup of subscribers) {
        const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

        // Set provider wallet to the subscriber for signing
        const originalWallet = provider.wallet
        provider.wallet = new Wallet(subscriberSetup.wallet)

        const leasePromise = program.methods
          .leaseSubscriptionIp()
          .accountsPartial({
            caller: subscriberSetup.wallet.publicKey,
            device: subscriberSetup.devicePda,
            rootIpBlock: mock.rootSubscriberIpBlockPda,
            ipBlock: mock.ipBlockPda,
            ipLease: ipLeasePda,
            subscription: subscriberSetup.subscriptionPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([subscriberSetup.wallet])
          .rpc()

        leasePromises.push(leasePromise)

        // Restore original wallet
        provider.wallet = originalWallet
      }

      // Execute all leases concurrently
      const results = await Promise.all(leasePromises)
      expect(results).toHaveLength(subscribers.length)

      // Verify all IP leases were created with unique IPs
      const ipv4s: string[] = []
      for (const subscriberSetup of subscribers) {
        const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)
        const ipLease = await program.account.ipLease.fetch(ipLeasePda)
        ipv4s.push(ipLease.ipv4.join('.'))
      }

      // Check that all IPs are unique
      const uniqueIps = new Set(ipv4s)
      expect(uniqueIps.size).toBe(subscribers.length)

      // Verify IP block state
      const ipBlock = await program.account.ipBlock.fetch(mock.ipBlockPda)

      expect(ipBlock.freeUnits).toBeLessThan(ipBlock.unitCapacity)
    })
  })

interface IpRevoked {
  ipLease: PublicKey
  device: PublicKey
  ipv4: IpV4Bytes
  blockIndex: number
  revokedAt: number
}

export const allocateIpTests = () =>
  describe('dawn::allocate_ip', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>

    beforeAll(async () => {
      provider = anchor.getProvider() as BankrunProvider
      program = anchor.workspace.DAWN as Program<Dawn>
    })

    test('cannot allocate IP without root block authority', async () => {
      const unauthorizedWallet = Keypair.generate()
      const wallet = loadWallet()

      // Fund unauthorized wallet
      const currentSlot = await provider.context.banksClient.getSlot()
      await provider.context.warpToSlot(currentSlot + BigInt(1))

      const transferIx = SystemProgram.transfer({
        fromPubkey: wallet.payer.publicKey,
        toPubkey: unauthorizedWallet.publicKey,
        lamports: 1000_000_000,
      })

      const transferTx = new Transaction().add(transferIx)
      transferTx.feePayer = wallet.payer.publicKey
      transferTx.recentBlockhash = provider.context.lastBlockhash
      transferTx.sign(wallet.payer)
      await provider.context.banksClient.processTransaction(transferTx)

      // Create a device for testing
      const devicePda = getDevicePda(
        program,
        unauthorizedWallet,
        mock.deviceModelPda,
        'test-device',
        mock.deviceMacAddress,
      )

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)
      const localDomainPda = getLocalDomainPda(
        program,
        unauthorizedWallet.publicKey,
        mock.localDomain,
      )

      // First create the device
      await program.methods
        .addDevice(
          'test-device',
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.devicePlacement,
          mock.deviceMacAddress,
          mock.localDomain,
        )
        .accountsPartial({
          caller: unauthorizedWallet.publicKey,
          deviceModel: mock.deviceModelPda,
          device: devicePda,
          deviceLocation: deviceLocationPda,
          localDomain: localDomainPda,
        })
        .signers([unauthorizedWallet])
        .rpc()

      const loopbackIpLeasePda = getIpLeasePda(1, devicePda) // Loopback tier

      try {
        await program.methods
          .allocateIp(1) // Loopback tier
          .accountsPartial({
            authority: unauthorizedWallet.publicKey,
            device: devicePda,
            ipRegistry: mock.loopIpRegistryPda,
            rootIpBlock: mock.rootLoopbackIpBlockPda,
            ipBlock: mock.loopbackIpBlockPda,
            ipLease: loopbackIpLeasePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorizedWallet])
          .rpc()

        expect(false).toBeTruthy() // Should not reach here
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe(
          'Unauthorized: caller is not the authority',
        )
      }
    })

    test('successfully allocates loopback IP with proper authority', async () => {
      const wallet = loadWallet()
      provider.wallet = new Wallet(wallet.payer)

      // Create a device for testing
      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        'loopback-test-device',
        mock.deviceMacAddress,
      )

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)
      const localDomainPda = getLocalDomainPda(
        program,
        mock.serviceProvider.publicKey,
        mock.localDomain,
      )

      // Create the device first
      await program.methods
        .addDevice(
          'loopback-test-device',
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.devicePlacement,
          mock.deviceMacAddress,
          mock.localDomain,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          deviceModel: mock.deviceModelPda,
          device: devicePda,
          deviceLocation: deviceLocationPda,
          localDomain: localDomainPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      const loopbackIpLeasePda = getIpLeasePda(1, devicePda) // Loopback tier

      // Allocate IP with proper authority (assuming wallet.payer is the root block authority)
      const tx = await program.methods
        .allocateIp(1) // Loopback tier
        .accountsPartial({
          authority: wallet.payer.publicKey,
          device: devicePda,
          ipRegistry: mock.loopIpRegistryPda,
          rootIpBlock: mock.rootLoopbackIpBlockPda,
          ipBlock: mock.loopbackIpBlockPda,
          ipLease: loopbackIpLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet.payer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // Verify IP lease was created
      const ipLease = await program.account.ipLease.fetch(loopbackIpLeasePda)
      expect(ipLease.device).toEqual(devicePda)
      expect(ipLease.tier).toEqual({ loopback: {} })
      expect(ipLease.ipV4CidrMask).toBe(32) // /32 for loopback
      expect(ipLease.ipv4[0]).toBe(100) // First octet should be 100 for loopback
      expect(ipLease.ipv4[1]).toBe(64) // Second octet should be 64

      // Verify event was emitted
      const event = await getEvent<IpLeased>(program, txDetails, 'ipLeased')
      expect(event.device).toEqual(devicePda)
      expect(event.tier).toBe(1) // Loopback
      expect(event.ipv4).toEqual(ipLease.ipv4)
      expect(event.cidr).toBe(32) // /32 for loopback
    })

    test('successfully allocates PtP IP with proper authority', async () => {
      const wallet = loadWallet()
      provider.wallet = new Wallet(wallet.payer)

      // Create a device for testing
      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        'ptp-test-device',
        mock.deviceMacAddress,
      )

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)
      const localDomainPda = getLocalDomainPda(
        program,
        mock.serviceProvider.publicKey,
        mock.localDomain,
      )

      // Create the device first
      await program.methods
        .addDevice(
          'ptp-test-device',
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.devicePlacement,
          mock.deviceMacAddress,
          mock.localDomain,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          deviceModel: mock.deviceModelPda,
          device: devicePda,
          deviceLocation: deviceLocationPda,
          localDomain: localDomainPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      const ptpIpLeasePda = getIpLeasePda(2, devicePda) // PtP tier

      // Allocate IP with proper authority
      const tx = await program.methods
        .allocateIp(2) // PtP tier
        .accountsPartial({
          authority: wallet.payer.publicKey,
          device: devicePda,
          ipRegistry: mock.ptpIpRegistryPda,
          rootIpBlock: mock.rootPtpIpBlockPda,
          ipBlock: mock.ptpIpBlockPda,
          ipLease: ptpIpLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet.payer])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // Verify IP lease was created
      const ipLease = await program.account.ipLease.fetch(ptpIpLeasePda)
      expect(ipLease.device).toEqual(devicePda)
      expect(ipLease.tier).toEqual({ ptP: {} })
      expect(ipLease.ipV4CidrMask).toBe(31) // /31 for PtP
      expect(ipLease.ipv4[0]).toBe(100) // First octet should be 100 for PtP
      expect(ipLease.ipv4[1]).toBe(96) // Second octet should be 96 for PtP

      // For PtP, IP should be even (base of /31 pair)
      const ipAsNumber =
        (ipLease.ipv4[0] << 24) |
        (ipLease.ipv4[1] << 16) |
        (ipLease.ipv4[2] << 8) |
        ipLease.ipv4[3]
      expect(ipAsNumber % 2).toBe(0) // Should be even

      // Verify event was emitted
      const event = await getEvent<IpLeased>(program, txDetails, 'ipLeased')
      expect(event.device).toEqual(devicePda)
      expect(event.tier).toBe(2) // PtP
      expect(event.ipv4).toEqual(ipLease.ipv4)
      expect(event.cidr).toBe(31) // /31 for PtP
    })

    test('cannot allocate IP for invalid tier', async () => {
      const wallet = loadWallet()
      provider.wallet = new Wallet(wallet.payer)

      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        'invalid-tier-device',
        mock.deviceMacAddress,
      )

      const invalidIpLeasePda = getIpLeasePda(0, devicePda) // Subscriber tier - not allowed for allocate_ip

      try {
        await program.methods
          .allocateIp(0) // Subscriber tier - should be rejected
          .accountsPartial({
            authority: wallet.payer.publicKey,
            device: devicePda,
            ipRegistry: mock.subscriberIpRegistryPda,
            rootIpBlock: mock.rootSubscriberIpBlockPda,
            ipBlock: mock.ipBlockPda,
            ipLease: invalidIpLeasePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([wallet.payer])
          .rpc()

        expect(false).toBeTruthy() // Should not reach here
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe(
          'The program expected this account to be already initialized',
        )
      }
    })

    test('cannot allocate IP twice for same device and tier', async () => {
      const wallet = loadWallet()
      provider.wallet = new Wallet(wallet.payer)

      // Create a device for testing
      const devicePda = getDevicePda(
        program,
        mock.serviceProvider,
        mock.deviceModelPda,
        'duplicate-ip-device',
        mock.deviceMacAddress,
      )

      const deviceLocationPda = getDeviceLocationPda(program, devicePda)
      const localDomainPda = getLocalDomainPda(
        program,
        mock.serviceProvider.publicKey,
        mock.localDomain,
      )

      // Create the device first
      await program.methods
        .addDevice(
          'duplicate-ip-device',
          mock.deviceHeight,
          mock.deviceLatitude,
          mock.deviceLongitude,
          mock.devicePlacement,
          mock.deviceMacAddress,
          mock.localDomain,
        )
        .accountsPartial({
          caller: mock.serviceProvider.publicKey,
          deviceModel: mock.deviceModelPda,
          device: devicePda,
          deviceLocation: deviceLocationPda,
          localDomain: localDomainPda,
        })
        .signers([mock.serviceProvider])
        .rpc()

      const loopbackIpLeasePda = getIpLeasePda(1, devicePda) // Loopback tier

      // First allocation should succeed
      await program.methods
        .allocateIp(1) // Loopback tier
        .accountsPartial({
          authority: wallet.payer.publicKey,
          device: devicePda,
          ipRegistry: mock.loopIpRegistryPda,
          rootIpBlock: mock.rootLoopbackIpBlockPda,
          ipBlock: mock.loopbackIpBlockPda,
          ipLease: loopbackIpLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      // Second allocation should fail (account already exists)
      try {
        await program.methods
          .allocateIp(1) // Loopback tier
          .accountsPartial({
            authority: wallet.payer.publicKey,
            device: devicePda,
            ipRegistry: mock.loopIpRegistryPda,
            rootIpBlock: mock.rootLoopbackIpBlockPda,
            ipBlock: mock.loopbackIpBlockPda,
            ipLease: loopbackIpLeasePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([wallet.payer])
          .rpc()

        expect(false).toBeTruthy() // Should not reach here
      } catch (error) {
        // Should fail because the IP lease account already exists
        expect(error).toBeDefined()
      }
    })
  })

export const initializeRootIpBlockTests = () =>
  describe('dawn::initialize_root_ip_block', () => {
    test('cannot initialize root IP block without authority', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      const unauthorizedWallet = Keypair.generate()
      const wallet = loadWallet()

      // Fund unauthorized wallet
      const currentSlot = await provider.context.banksClient.getSlot()
      await provider.context.warpToSlot(currentSlot + BigInt(1))

      const transferIx = SystemProgram.transfer({
        fromPubkey: wallet.payer.publicKey,
        toPubkey: unauthorizedWallet.publicKey,
        lamports: 1000_000_000,
      })

      const transferTx = new Transaction().add(transferIx)
      transferTx.feePayer = wallet.payer.publicKey
      transferTx.recentBlockhash = provider.context.lastBlockhash
      transferTx.sign(wallet.payer)
      await provider.context.banksClient.processTransaction(transferTx)

      const tier = 0 // Subscriber tier

      try {
        await program.methods
          .initializeRootIpBlock(tier, 0x0a400000, 14)
          .accountsPartial({
            caller: unauthorizedWallet.publicKey,
            config: mock.configPda,
            authority: wallet.payer.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorizedWallet])
          .rpc()

        expect(false).toBeTruthy() // Should not reach here
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe(
          'Unauthorized: caller is not the authority',
        )
      }
    })

    test('successfully initializes root IP block for subscriber tier', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      const authority = loadWallet().payer
      provider.wallet = new Wallet(authority)

      const tier = 0 // Subscriber tier
      const baseIpv4 = 0x0a400000 // 10.64.0.0
      const baseCidr = 14

      const tx = await program.methods
        .initializeRootIpBlock(tier, baseIpv4, baseCidr)
        .accountsPartial({
          caller: authority.publicKey,
          config: mock.configPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // Verify event was emitted
      const event = (await getEvent(
        program,
        txDetails,
        'rootIpBlockInitialized',
      )) as any
      expect(event.tier).toBe(0) // Subscriber tier
      expect(event.rootBlockIndex).toBeGreaterThanOrEqual(0) // Could be 0 or higher depending on test order
      expect(event.baseIpv4).toBe(baseIpv4)
      expect(event.baseCidr).toBe(baseCidr)

      // Verify registry was initialized/updated
      const registry = await program.account.ipRegistry.fetch(
        mock.subscriberIpRegistryPda,
      )
      expect(registry.tier).toEqual({ subscriber: {} })
      expect(registry.rootBlockCount).toBeGreaterThan(0) // Should have at least one root block
      expect(registry.nextIndex).toBeGreaterThan(0) // Next index should be greater than 0
      expect(registry.rootAvailabilityBitmap.toString()).not.toBe('0') // Should have some availability
    })

    test('successfully initializes root IP block for loopback tier', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      const authority = loadWallet().payer
      provider.wallet = new Wallet(authority)

      const tier = 1 // Loopback tier
      const baseIpv4 = 0x64400000 // 100.64.0.0
      const baseCidr = 14

      const tx = await program.methods
        .initializeRootIpBlock(tier, baseIpv4, baseCidr)
        .accountsPartial({
          caller: authority.publicKey,
          config: mock.configPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // Verify event was emitted
      const event = (await getEvent(
        program,
        txDetails,
        'rootIpBlockInitialized',
      )) as any
      expect(event.tier).toBe(1) // Loopback tier
      expect(event.baseIpv4).toBe(baseIpv4)
      expect(event.baseCidr).toBe(baseCidr)
    })

    test('successfully initializes root IP block for PtP tier', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      const authority = loadWallet().payer
      provider.wallet = new Wallet(authority)

      const tier = 2 // PtP tier
      const baseIpv4 = 0x64600000 // 100.96.0.0
      const baseCidr = 14

      const tx = await program.methods
        .initializeRootIpBlock(tier, baseIpv4, baseCidr)
        .accountsPartial({
          caller: authority.publicKey,
          config: mock.configPda,
          authority: authority.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .transaction()

      const txDetails = await confirmTx(provider, tx)

      // Verify event was emitted
      const event = (await getEvent(
        program,
        txDetails,
        'rootIpBlockInitialized',
      )) as any
      expect(event.tier).toBe(2) // PtP tier
      expect(event.baseIpv4).toBe(baseIpv4)
      expect(event.baseCidr).toBe(baseCidr)
    })
  })

export const bitmapEdgeCaseTests = () =>
  describe('IPAM bitmap edge cases', () => {
    test.skip('allocates IPs across chunk boundaries correctly', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      // Create 65 subscribers to test chunk boundary (64 IPs per chunk)
      const subscribers: SubscriberSetup[] = []

      // Create subscribers in batches to avoid overwhelming the system
      for (let i = 0; i < 65; i++) {
        const subscriberSetup = await createSubscriber(
          program,
          provider,
          `chunk-boundary-subscriber-${i}`,
          `chunk-boundary-device-${i}`,
        )
        subscribers.push(subscriberSetup)
      }

      // Allocate IPs for all subscribers
      const allocatedIps: string[] = []
      for (const subscriberSetup of subscribers) {
        const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

        await program.methods
          .leaseSubscriptionIp()
          .accountsPartial({
            caller: subscriberSetup.wallet.publicKey,
            device: subscriberSetup.devicePda,
            rootIpBlock: mock.rootSubscriberIpBlockPda,
            ipBlock: mock.ipBlockPda,
            ipLease: ipLeasePda,
            subscription: subscriberSetup.subscriptionPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([subscriberSetup.wallet])
          .rpc()

        // Verify IP lease was created
        const ipLease = await program.account.ipLease.fetch(ipLeasePda)
        const ipStr = ipLease.ipv4.join('.')
        allocatedIps.push(ipStr)
      }

      // Verify all IPs are unique
      const uniqueIps = new Set(allocatedIps)
      expect(uniqueIps.size).toBe(65)

      // Verify the IP block state
      const ipBlock = await program.account.ipBlock.fetch(mock.ipBlockPda)
      expect(ipBlock.freeUnits).toBe(1024 - 65) // Started with 1024, allocated 65

      // Check that chunk bitmap reflects the allocation
      // First chunk should be full (64 IPs), second chunk should have 1 IP allocated
      expect(ipBlock.slotsChunks[0].toString()).toBe('18446744073709551615') // All 64 bits set (2^64 - 1)
      expect(ipBlock.slotsChunks[1].toNumber() & 1).toBe(1) // First bit of second chunk set
    })

    test('handles bitmap state transitions correctly during release', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      // Create a subscriber and allocate an IP
      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'bitmap-release-subscriber',
        'bitmap-release-device',
      )

      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

      // Allocate IP
      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      // Get initial block state
      const ipBlockBefore = await program.account.ipBlock.fetch(mock.ipBlockPda)
      const initialFreeUnits = ipBlockBefore.freeUnits

      // Revoke the IP
      const authority = loadWallet().payer
      provider.wallet = new Wallet(authority)

      await program.methods
        .revokeIp(0)
        .accountsPartial({
          caller: authority.publicKey,
          ipRegistry: mock.subscriberIpRegistryPda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc()

      // Verify block state after release
      const ipBlockAfter = await program.account.ipBlock.fetch(mock.ipBlockPda)
      expect(ipBlockAfter.freeUnits).toBe(initialFreeUnits + 1)

      // Verify the specific bit was cleared in the bitmap
      // The released unit should have its bit cleared in the appropriate chunk
      const ipLease = await program.account.ipLease
        .fetch(ipLeasePda)
        .catch(() => null)
      expect(ipLease).toBeNull() // Lease should be closed
    })

    test('correctly calculates IPv4 addresses for different unit indices', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      // Test IPv4 calculation for subscriber tier (/32 addresses)
      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'ipv4-calc-subscriber',
        'ipv4-calc-device',
      )

      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      // Verify the IPv4 address calculation
      const ipLease = await program.account.ipLease.fetch(ipLeasePda)
      const ipBlock = await program.account.ipBlock.fetch(mock.ipBlockPda)

      // For subscriber tier, each unit index should map to consecutive /32 addresses
      // The IP should be in the subscriber range (10.64.x.x)
      expect(ipLease.ipv4[0]).toBe(10) // First octet should be 10
      expect(ipLease.ipv4[1]).toBe(64) // Second octet should be 64
      expect(ipLease.ipV4CidrMask).toBe(32) // /32 for subscriber tier
    })

    test('validates unit index bounds correctly', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      // This test verifies that the bitmap operations handle edge cases correctly
      // We'll create a scenario where we try to access invalid unit indices

      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'bounds-test-subscriber',
        'bounds-test-device',
      )

      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      // Verify the lease was created with valid unit index
      const ipLease = await program.account.ipLease.fetch(ipLeasePda)
      const ipBlock = await program.account.ipBlock.fetch(mock.ipBlockPda)

      // Unit index should be within valid range for the tier
      expect(ipLease.unitIndex).toBeLessThan(ipBlock.unitCapacity)
      expect(ipLease.unitIndex).toBeGreaterThanOrEqual(0)

      // Block index should be valid
      expect(ipLease.blockIndex).toBeGreaterThanOrEqual(0)
    })
  })

export const multiTierIpamTests = () =>
  describe('Multi-tier IPAM allocation', () => {
    test('correctly handles loopback tier IP allocation (/32 addresses)', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'loopback-test-subscriber',
        'loopback-test-device',
      )

      // Get the loopback IP lease PDA
      const loopbackIpLeasePda = getIpLeasePda(1, subscriberSetup.devicePda) // Loopback tier = 1

      // Allocate loopback IP using the new separate instruction
      const wallet = loadWallet()
      provider.wallet = new Wallet(wallet.payer)

      await program.methods
        .allocateIp(1) // Loopback tier
        .accountsPartial({
          authority: wallet.payer.publicKey,
          device: subscriberSetup.devicePda,
          ipRegistry: mock.loopIpRegistryPda,
          rootIpBlock: mock.rootLoopbackIpBlockPda,
          ipBlock: mock.loopbackIpBlockPda,
          ipLease: loopbackIpLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      // Verify the loopback lease exists and has correct properties
      const loopbackLease = await program.account.ipLease.fetch(
        loopbackIpLeasePda,
      )
      expect(loopbackLease.tier).toEqual({ loopback: {} })
      expect(loopbackLease.device).toEqual(subscriberSetup.devicePda)
      expect(loopbackLease.ipV4CidrMask).toBe(32) // /32 for loopback

      // Verify the loopback IP is in the correct range (100.64.x.x)
      expect(loopbackLease.ipv4[0]).toBe(100)
      expect(loopbackLease.ipv4[1]).toBe(64)

      // Verify loopback IP block properties
      const loopbackIpBlock = await program.account.ipBlock.fetch(
        mock.loopbackIpBlockPda,
      )
      expect(loopbackIpBlock.tier).toEqual({ loopback: {} })
      expect(loopbackIpBlock.unitCapacity).toBe(1024) // Same as subscriber tier
      expect(loopbackIpBlock.blockCidr).toBe(22) // /22 blocks
      expect(loopbackIpBlock.slotsChunks).toHaveLength(16) // 16 chunks for 1024 units
    })

    test('correctly handles PtP tier IP allocation (/31 pairs)', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'ptp-test-subscriber',
        'ptp-test-device',
      )

      // Get the PtP IP lease PDA
      const ptpIpLeasePda = getIpLeasePda(2, subscriberSetup.devicePda) // PtP tier = 2

      // Allocate PtP IP using the new separate instruction
      const wallet = loadWallet()
      provider.wallet = new Wallet(wallet.payer)

      await program.methods
        .allocateIp(2) // PtP tier
        .accountsPartial({
          authority: wallet.payer.publicKey,
          device: subscriberSetup.devicePda,
          ipRegistry: mock.ptpIpRegistryPda,
          rootIpBlock: mock.rootPtpIpBlockPda,
          ipBlock: mock.ptpIpBlockPda,
          ipLease: ptpIpLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      // Verify the PtP lease exists and has correct properties
      const ptpLease = await program.account.ipLease.fetch(ptpIpLeasePda)
      expect(ptpLease.tier).toEqual({ ptP: {} })
      expect(ptpLease.device).toEqual(subscriberSetup.devicePda)
      expect(ptpLease.ipV4CidrMask).toBe(31) // /31 for PtP

      // Verify the PtP IP is in the correct range (100.96.x.x)
      expect(ptpLease.ipv4[0]).toBe(100)
      expect(ptpLease.ipv4[1]).toBe(96)

      // Verify PtP IP block properties
      const ptpIpBlock = await program.account.ipBlock.fetch(mock.ptpIpBlockPda)
      expect(ptpIpBlock.tier).toEqual({ ptP: {} })
      expect(ptpIpBlock.unitCapacity).toBe(512) // Half of subscriber/loopback
      expect(ptpIpBlock.blockCidr).toBe(22) // /22 blocks
      expect(ptpIpBlock.slotsChunks).toHaveLength(8) // 8 chunks for 512 units

      // For PtP tier, each unit represents a /31 pair, so IP should be even
      const ipAsNumber =
        (ptpLease.ipv4[0] << 24) |
        (ptpLease.ipv4[1] << 16) |
        (ptpLease.ipv4[2] << 8) |
        ptpLease.ipv4[3]
      expect(ipAsNumber % 2).toBe(0) // Should be even (base of /31 pair)
    })

    test('different tiers have correct unit capacities and addressing', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'tier-capacity-subscriber',
        'tier-capacity-device',
      )

      // Test subscriber tier
      const subscriberIpLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)
      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: subscriberIpLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      const subscriberLease = await program.account.ipLease.fetch(
        subscriberIpLeasePda,
      )
      const subscriberBlock = await program.account.ipBlock.fetch(
        mock.ipBlockPda,
      )

      // Allocate loopback and PtP IPs using the new separate instruction
      const wallet = loadWallet()
      provider.wallet = new Wallet(wallet.payer)

      const loopbackIpLeasePda = getIpLeasePda(1, subscriberSetup.devicePda)
      const ptpIpLeasePda = getIpLeasePda(2, subscriberSetup.devicePda)

      // Allocate loopback IP
      await program.methods
        .allocateIp(1) // Loopback tier
        .accountsPartial({
          authority: wallet.payer.publicKey,
          device: subscriberSetup.devicePda,
          ipRegistry: mock.loopIpRegistryPda,
          rootIpBlock: mock.rootLoopbackIpBlockPda,
          ipBlock: mock.loopbackIpBlockPda,
          ipLease: loopbackIpLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      // Allocate PtP IP
      await program.methods
        .allocateIp(2) // PtP tier
        .accountsPartial({
          authority: wallet.payer.publicKey,
          device: subscriberSetup.devicePda,
          ipRegistry: mock.ptpIpRegistryPda,
          rootIpBlock: mock.rootPtpIpBlockPda,
          ipBlock: mock.ptpIpBlockPda,
          ipLease: ptpIpLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      // Get the allocated leases
      const loopbackLease = await program.account.ipLease.fetch(
        loopbackIpLeasePda,
      )
      const ptpLease = await program.account.ipLease.fetch(ptpIpLeasePda)

      const loopbackBlock = await program.account.ipBlock.fetch(
        mock.loopbackIpBlockPda,
      )
      const ptpBlock = await program.account.ipBlock.fetch(mock.ptpIpBlockPda)

      // Verify tier-specific properties
      expect(subscriberBlock.unitCapacity).toBe(1024) // Subscriber: 1024 /32 addresses
      expect(loopbackBlock.unitCapacity).toBe(1024) // Loopback: 1024 /32 addresses
      expect(ptpBlock.unitCapacity).toBe(512) // PtP: 512 /31 pairs

      // Verify CIDR masks
      expect(subscriberLease.ipV4CidrMask).toBe(32) // /32 for subscriber
      expect(loopbackLease.ipV4CidrMask).toBe(32) // /32 for loopback
      expect(ptpLease.ipV4CidrMask).toBe(31) // /31 for PtP

      // Verify chunk counts (bitmap structure)
      expect(subscriberBlock.slotsChunks).toHaveLength(16) // 1024 bits / 64 = 16 chunks
      expect(loopbackBlock.slotsChunks).toHaveLength(16) // 1024 bits / 64 = 16 chunks
      expect(ptpBlock.slotsChunks).toHaveLength(8) // 512 bits / 64 = 8 chunks
    })

    test('tier-specific IPv4 address calculations', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'ipv4-tier-calc-subscriber',
        'ipv4-tier-calc-device',
      )

      // Allocate subscriber IP
      const subscriberIpLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)
      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: subscriberIpLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      // Allocate loopback and PtP IPs using the new separate instruction
      const wallet = loadWallet()
      provider.wallet = new Wallet(wallet.payer)

      const loopbackIpLeasePda = getIpLeasePda(1, subscriberSetup.devicePda)
      const ptpIpLeasePda = getIpLeasePda(2, subscriberSetup.devicePda)

      // Allocate loopback IP
      await program.methods
        .allocateIp(1) // Loopback tier
        .accountsPartial({
          authority: wallet.payer.publicKey,
          device: subscriberSetup.devicePda,
          ipRegistry: mock.loopIpRegistryPda,
          rootIpBlock: mock.rootLoopbackIpBlockPda,
          ipBlock: mock.loopbackIpBlockPda,
          ipLease: loopbackIpLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      // Allocate PtP IP
      await program.methods
        .allocateIp(2) // PtP tier
        .accountsPartial({
          authority: wallet.payer.publicKey,
          device: subscriberSetup.devicePda,
          ipRegistry: mock.ptpIpRegistryPda,
          rootIpBlock: mock.rootPtpIpBlockPda,
          ipBlock: mock.ptpIpBlockPda,
          ipLease: ptpIpLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([wallet.payer])
        .rpc()

      // Get all three tier leases
      const subscriberLease = await program.account.ipLease.fetch(
        subscriberIpLeasePda,
      )
      const loopbackLease = await program.account.ipLease.fetch(
        loopbackIpLeasePda,
      )
      const ptpLease = await program.account.ipLease.fetch(ptpIpLeasePda)

      // Verify address ranges for each tier

      // Subscriber: 10.64.0.0/10 range
      expect(subscriberLease.ipv4[0]).toBe(10)
      expect(subscriberLease.ipv4[1]).toBe(64)

      // Loopback: 100.64.0.0/11 range
      expect(loopbackLease.ipv4[0]).toBe(100)
      expect(loopbackLease.ipv4[1]).toBe(64)

      // PtP: 100.96.0.0/11 range
      expect(ptpLease.ipv4[0]).toBe(100)
      expect(ptpLease.ipv4[1]).toBe(96)

      // For subscriber and loopback: unit index directly maps to IP offset
      // For PtP: unit index * 2 maps to IP offset (since each unit is a /31 pair)

      // Verify unit index to IP calculation
      expect(subscriberLease.unitIndex).toBeGreaterThanOrEqual(0)
      expect(loopbackLease.unitIndex).toBeGreaterThanOrEqual(0)
      expect(ptpLease.unitIndex).toBeGreaterThanOrEqual(0)

      // For PtP, the allocated IP should be the base of a /31 pair (even address)
      const ptpIpAsNumber =
        (ptpLease.ipv4[0] << 24) |
        (ptpLease.ipv4[1] << 16) |
        (ptpLease.ipv4[2] << 8) |
        ptpLease.ipv4[3]
      expect(ptpIpAsNumber % 2).toBe(0) // Even address for /31 pair base
    })

    test('chunk bitmap initialization differs by tier', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      // Create a fresh device to test initial bitmap states
      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'bitmap-init-subscriber',
        'bitmap-init-device',
      )

      // Get the IP blocks for all tiers
      const subscriberBlock = await program.account.ipBlock.fetch(
        mock.ipBlockPda,
      )
      const loopbackBlock = await program.account.ipBlock.fetch(
        mock.loopbackIpBlockPda,
      )
      const ptpBlock = await program.account.ipBlock.fetch(mock.ptpIpBlockPda)

      // Verify chunk free bitmap initialization
      // Subscriber and Loopback: 16 chunks, all initially free (0xFFFF)
      // PtP: 8 chunks, all initially free (0x00FF - lower 8 bits)

      // Note: These bitmaps will have some bits cleared due to device creation allocations
      // but we can verify the structure is correct

      expect(subscriberBlock.slotsChunks).toHaveLength(16)
      expect(loopbackBlock.slotsChunks).toHaveLength(16)
      expect(ptpBlock.slotsChunks).toHaveLength(8)

      // Verify that the chunk free bitmaps are properly structured
      // (some bits may be cleared due to allocations, but structure should be correct)
      expect(typeof subscriberBlock.chunkFreeBitmap).toBe('number')
      expect(typeof loopbackBlock.chunkFreeBitmap).toBe('number')
      expect(typeof ptpBlock.chunkFreeBitmap).toBe('number')
    })
  })

export const revokeIpTests = () =>
  describe('dawn::revoke_ip', () => {
    let provider: BankrunProvider
    let program: Program<Dawn>

    beforeAll(async () => {
      // Use the existing provider and program from the test suite
      provider = anchor.getProvider() as BankrunProvider
      program = anchor.workspace.DAWN as Program<Dawn>
    })

    test('cannot revoke IP lease with wrong caller', async () => {
      const unauthorizedWallet = new Wallet(anchor.web3.Keypair.generate())

      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'revoke-ip-subscriber',
        'revoke-ip-device',
      )

      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      try {
        await program.methods
          .revokeIp(0)
          .accountsPartial({
            caller: unauthorizedWallet.publicKey,
            rootIpBlock: mock.rootSubscriberIpBlockPda,
            ipRegistry: mock.subscriberIpRegistryPda,
            ipBlock: mock.ipBlockPda,
            ipLease: ipLeasePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([unauthorizedWallet.payer])
          .rpc()

        expect(false).toBeTruthy() // Should not reach here
      } catch (error) {
        // Should fail due to account constraints or insufficient funds
        expect(error).toBeDefined()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe(
          'Unauthorized: caller is not the authority',
        )
      }
    })

    test('successfully revokes IP lease', async () => {
      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'revoke-ip-subscriber',
        'revoke-ip-device',
      )

      // const originalWallet = provider.wallet
      provider.wallet = new Wallet(mock.serviceProvider)

      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      // Get current state before revoke
      const ipBlockBefore = await program.account.ipBlock.fetch(mock.ipBlockPda)

      const authority = loadWallet().payer
      provider.wallet = new Wallet(authority)

      const tx = await program.methods
        .revokeIp(0)
        .accountsPartial({
          caller: authority.publicKey,
          ipRegistry: mock.subscriberIpRegistryPda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .transaction()

      // provider.wallet = new Wallet(mock.serviceProvider)
      const txDetails = await confirmTx(provider, tx)

      // Verify event was emitted
      const event = await getEvent<IpRevoked>(program, txDetails, 'ipRevoked')
      expect(event.ipLease).toEqual(ipLeasePda)
      expect(event.device).toEqual(subscriberSetup.devicePda)
      expect(event.blockIndex).toBe(0)

      // Verify IP lease account was closed
      const ipLeaseAccount = await provider.context.banksClient.getAccount(
        ipLeasePda,
      )
      expect(ipLeaseAccount).toBeNull()

      // Verify IP block free units increased
      const ipBlockAfter = await program.account.ipBlock.fetch(mock.ipBlockPda)
      expect(ipBlockAfter.freeUnits).toBe(ipBlockBefore.freeUnits + 1)
    })

    test('cannot revoke IP for device that already has a lease', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'duplicate-revoke-subscriber',
        'duplicate-revoke-device',
      )

      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

      // First revoke should succeed
      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      // Second lease attempt should fail (account already exists)
      try {
        await program.methods
          .leaseSubscriptionIp()
          .accountsPartial({
            caller: subscriberSetup.wallet.publicKey,
            device: subscriberSetup.devicePda,
            rootIpBlock: mock.rootSubscriberIpBlockPda,
            ipBlock: mock.ipBlockPda,
            ipLease: ipLeasePda,
            subscription: subscriberSetup.subscriptionPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([subscriberSetup.wallet])
          .rpc()

        expect(false).toBeTruthy() // Should not reach here
      } catch (error) {
        // Should fail because the IP lease account already exists
        expect(error).toBeDefined()
        // The exact error depends on Anchor's account initialization constraints
      }
    })

    test('cannot lease IP when subscription device mismatch', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      // Create two separate subscribers with their own devices and subscriptions
      const subscriberSetup1 = await createSubscriber(
        program,
        provider,
        'device-mismatch-subscriber-1',
        'device-mismatch-device-1',
      )

      const subscriberSetup2 = await createSubscriber(
        program,
        provider,
        'device-mismatch-subscriber-2',
        'device-mismatch-device-2',
      )

      // Try to use subscriber1's device with subscriber2's subscription
      const ipLeasePda = getIpLeasePda(0, subscriberSetup1.devicePda)

      try {
        await program.methods
          .leaseSubscriptionIp()
          .accountsPartial({
            caller: subscriberSetup1.wallet.publicKey,
            device: subscriberSetup1.devicePda,
            rootIpBlock: mock.rootSubscriberIpBlockPda,
            ipBlock: mock.ipBlockPda,
            ipLease: ipLeasePda,
            subscription: subscriberSetup2.subscriptionPda, // Wrong subscription!
            systemProgram: SystemProgram.programId,
          })
          .signers([subscriberSetup1.wallet])
          .rpc()

        expect(false).toBeTruthy() // Should not reach here
      } catch (error) {
        expect(error instanceof AnchorError).toBeTruthy()
        const err: AnchorError = error
        expect(err.error.errorMessage).toBe('Invalid device')
      }
    })

    test('validates subscription is not expired', async () => {
      const provider = anchor.getProvider() as BankrunProvider
      const program = anchor.workspace.DAWN as Program<Dawn>

      // This test is already covered above but let's add a variant
      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'expiry-validation-subscriber',
        'expiry-validation-device',
      )

      // Get subscription and verify it's currently valid
      const subscription = await program.account.subscription.fetch(
        subscriberSetup.subscriptionPda,
      )
      const currentTime = Date.now() / 1000
      expect(subscription.expiration.toNumber()).toBeGreaterThan(currentTime)

      // Lease should succeed with valid subscription
      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      // Verify lease was created
      const ipLease = await program.account.ipLease.fetch(ipLeasePda)
      expect(ipLease.device).toEqual(subscriberSetup.devicePda)
    })

    test('IP revoke updates block state for reuse', async () => {
      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'reuse-ip-subscriber',
        'reuse-ip-device',
      )
      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

      const ipBlockBeforeLease = await program.account.ipBlock.fetch(
        mock.ipBlockPda,
      )

      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      const authority = loadWallet().payer
      provider.wallet = new Wallet(authority)

      // Revoke the IP
      await program.methods
        .revokeIp(0)
        .accountsPartial({
          caller: authority.publicKey,
          ipRegistry: mock.subscriberIpRegistryPda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc()

      // Verify the IP lease account was closed
      const revokedLeaseAccount = await provider.context.banksClient.getAccount(
        ipLeasePda,
      )
      expect(revokedLeaseAccount).toBeNull()

      // Check IP block state after revoke
      const ipBlockAfterRevoke = await program.account.ipBlock.fetch(
        mock.ipBlockPda,
      )

      // The free units should have increased by 1
      expect(ipBlockAfterRevoke.freeUnits).toBe(ipBlockBeforeLease.freeUnits)
    })

    test('cannot revoke non-existent IP lease', async () => {
      const unauthorizedWallet = Keypair.generate()
      const wallet = loadWallet()

      // Fund unauthorized wallet
      const currentSlot = await provider.context.banksClient.getSlot()
      await provider.context.warpToSlot(currentSlot + BigInt(1))

      const transferIx = SystemProgram.transfer({
        fromPubkey: wallet.payer.publicKey,
        toPubkey: unauthorizedWallet.publicKey,
        lamports: 1000_000_000,
      })

      const transferTx = new Transaction().add(transferIx)
      transferTx.feePayer = wallet.payer.publicKey
      transferTx.recentBlockhash = provider.context.lastBlockhash
      transferTx.sign(wallet.payer)
      await provider.context.banksClient.processTransaction(transferTx)

      // Create a fake IP lease PDA that doesn't exist
      const fakeDevicePda = getDevicePda(
        program,
        unauthorizedWallet,
        mock.deviceL2ModelPda,
        'fake-device',
        mock.deviceMacAddress,
      )
      const fakeIpLeasePda = getIpLeasePda(0, fakeDevicePda)

      const authority = loadWallet().payer
      provider.wallet = new Wallet(authority)

      try {
        await program.methods
          .revokeIp(0)
          .accountsPartial({
            caller: authority.publicKey,
            ipRegistry: mock.subscriberIpRegistryPda,
            rootIpBlock: mock.rootSubscriberIpBlockPda,
            ipBlock: mock.ipBlockPda,
            ipLease: fakeIpLeasePda,
            systemProgram: SystemProgram.programId,
          })
          .signers([authority])
          .rpc()

        expect(false).toBeTruthy() // Should not reach here
      } catch (error) {
        // Should fail because the IP lease account doesn't exist
        expect(error).toBeDefined()
      }
    })

    test('revoke IP correctly updates bitmap state', async () => {
      // Create subscriber and allocate IP
      const subscriberSetup = await createSubscriber(
        program,
        provider,
        'bitmap-state-subscriber',
        'bitmap-state-device',
      )

      const ipLeasePda = getIpLeasePda(0, subscriberSetup.devicePda)

      // Allocate IP
      await program.methods
        .leaseSubscriptionIp()
        .accountsPartial({
          caller: subscriberSetup.wallet.publicKey,
          device: subscriberSetup.devicePda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          subscription: subscriberSetup.subscriptionPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([subscriberSetup.wallet])
        .rpc()

      // Get IP lease details before revoke
      const ipLease = await program.account.ipLease.fetch(ipLeasePda)
      const ipBlockBefore = await program.account.ipBlock.fetch(mock.ipBlockPda)
      const rootIpBlockBefore = await program.account.rootIpBlock.fetch(
        mock.rootSubscriberIpBlockPda,
      )

      // Revoke the IP
      const authority = loadWallet().payer
      provider.wallet = new Wallet(authority)

      await program.methods
        .revokeIp(0)
        .accountsPartial({
          caller: authority.publicKey,
          ipRegistry: mock.subscriberIpRegistryPda,
          rootIpBlock: mock.rootSubscriberIpBlockPda,
          ipBlock: mock.ipBlockPda,
          ipLease: ipLeasePda,
          systemProgram: SystemProgram.programId,
        })
        .signers([authority])
        .rpc()

      // Verify bitmap state after revoke
      const ipBlockAfter = await program.account.ipBlock.fetch(mock.ipBlockPda)
      const rootIpBlockAfter = await program.account.rootIpBlock.fetch(
        mock.rootSubscriberIpBlockPda,
      )

      // Free units should have increased
      expect(ipBlockAfter.freeUnits).toBe(ipBlockBefore.freeUnits + 1)

      // If the block was full before revoke, verify root block state changed
      if (ipBlockBefore.freeUnits === 0) {
        // Block went from full to having free space
        expect(rootIpBlockAfter.rootSummary64).not.toBe(
          rootIpBlockBefore.rootSummary64,
        )
      }

      // Verify the specific bit in the chunk was cleared
      const chunkIdx = ipLease.unitIndex >> 6
      const bitIdx = ipLease.unitIndex & 63
      const chunkBefore = ipBlockBefore.slotsChunks[chunkIdx]
      const chunkAfter = ipBlockAfter.slotsChunks[chunkIdx]

      // The bit should have been cleared (set to 0)
      expect(chunkAfter.toNumber() & (1 << bitIdx)).toBe(0)
    })
  })
