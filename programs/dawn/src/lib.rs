#![allow(clippy::too_many_arguments)]
#![allow(deprecated)]

use anchor_lang::prelude::*;

#[cfg(not(feature = "devnet"))]
declare_id!("AHvnbnT3oeRSui4V1E47UsntZxtk9LuVfK7qmusJCeU8");

#[cfg(feature = "devnet")]
declare_id!("dawnUXwNb5Dp6mv7KdkwzCo28rNr7ATrb93nV2WjczQ");

mod app;
mod constants;
mod error;
mod events;
mod state;
mod utils;

use app::*;
use error::*;
use events::*;
use state::*;
use utils::{MerkleProof, SessionLeaf};

#[program]
pub mod dawn {
    use super::*;

    pub fn init_token(ctx: Context<InitializeToken>) -> Result<()> {
        DawnApp::init_token(ctx)
    }

    pub fn init_fee_accounts(ctx: Context<InitializeFeeAccounts>) -> Result<()> {
        DawnApp::init_fee_accounts(ctx)
    }

    pub fn configure(
        ctx: Context<Configure>,
        dawn_fee: u64,
        validator_fee: u64,
        medallion_fee: u64,
    ) -> Result<()> {
        DawnApp::configure(ctx, dawn_fee, validator_fee, medallion_fee)
    }

    pub fn register_auth_method(
        ctx: Context<RegisterAuthMethod>,
        method_type: AuthMethodType,
        parameters: [u8; 256],
    ) -> Result<()> {
        DawnApp::register_auth_method(ctx, method_type, parameters)
    }

    pub fn add_auth_method(ctx: Context<AddAuthMethod>) -> Result<()> {
        DawnApp::add_auth_method(ctx)
    }

    pub fn register_credential(
        ctx: Context<RegisterCredential>,
        client: Pubkey,
        credential_data: [u8; 128],
    ) -> Result<()> {
        DawnApp::register_credential(ctx, client, credential_data)
    }

    pub fn revoke_credential(ctx: Context<RevokeCredential>) -> Result<()> {
        DawnApp::revoke_credential(ctx)
    }

    pub fn register_connection(
        ctx: Context<RegisterConnection>,
        entity_a: Pubkey,
        entity_b: Pubkey,
        credential_data_a: [u8; 64],
        credential_data_b: [u8; 64],
    ) -> Result<()> {
        DawnApp::register_connection(
            ctx,
            entity_a,
            entity_b,
            credential_data_a,
            credential_data_b,
        )
    }

    pub fn revoke_connection(ctx: Context<RevokeConnection>) -> Result<()> {
        DawnApp::revoke_connection(ctx)
    }

    pub fn add_device_model(
        ctx: Context<AddDeviceModel>,
        device_type: DeviceType,
        manufacturer: String,
        model: String,
    ) -> Result<()> {
        DawnApp::add_device_model(ctx, device_type, manufacturer, model)
    }

    pub fn add_device(
        ctx: Context<AddDevice>,
        name: String,
        height: u16,
        latitude: i64,
        longitude: i64,
        placement: [i32; 2],
        mac_address: [u8; 6],
        local_domain_name: String,
    ) -> Result<()> {
        DawnApp::add_device(
            ctx,
            name,
            height,
            latitude,
            longitude,
            placement,
            mac_address,
            local_domain_name,
        )
    }

    pub fn verify_device_location(ctx: Context<VerifyDeviceLocation>) -> Result<()> {
        DawnApp::verify_device_location(ctx)
    }

    pub fn add_service_agreement(
        ctx: Context<AddServiceAgreement>,
        threshold: u64,
        payout_ratio: u64,
    ) -> Result<()> {
        DawnApp::add_service_agreement(ctx, threshold, payout_ratio)
    }

    pub fn add_l3_plan(
        ctx: Context<AddL3Plan>,
        name: String,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        start_at: Option<i64>,
    ) -> Result<()> {
        DawnApp::add_l3_plan(ctx, name, price, duration, speed, capacity, start_at)
    }

    pub fn add_l2_plan(
        ctx: Context<AddL2Plan>,
        name: String,
        price: u64,
        duration: u16,
        speed: u32,
        capacity: u64,
        start_at: Option<i64>,
    ) -> Result<()> {
        DawnApp::add_l2_plan(ctx, name, price, duration, speed, capacity, start_at)
    }

    pub fn subscribe<'info>(ctx: Context<'_, '_, '_, 'info, Subscribe<'info>>) -> Result<()> {
        DawnApp::subscribe(ctx)
    }

    pub fn extend_subscription(ctx: Context<ExtendSubscription>) -> Result<()> {
        DawnApp::extend_subscription(ctx)
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        DawnApp::claim(ctx)
    }

    // IPAM Instructions
    pub fn initialize_root_ip_block(
        ctx: Context<InitializeRootIpBlock>,
        tier: u8, // Tier enum serialized as u8
        base_ipv4: u32,
        base_cidr: u8,
    ) -> Result<()> {
        let tier_enum = IpTier::from_u8(tier).ok_or(DawnError::InvalidTier)?;
        DawnApp::initialize_root_ip_block(ctx, tier_enum, base_ipv4, base_cidr)
    }

    pub fn allocate_ip(ctx: Context<AllocateIp>, tier: u8) -> Result<()> {
        let tier_enum = IpTier::from_u8(tier).ok_or(DawnError::InvalidTier)?;
        DawnApp::allocate_ip(ctx, tier_enum)
    }

    pub fn lease_subscription_ip(ctx: Context<LeaseSubscriberIp>) -> Result<()> {
        DawnApp::lease_subscription_ip(ctx)
    }

    pub fn revoke_ip(ctx: Context<RevokeIp>, tier: u8) -> Result<()> {
        let tier_enum = IpTier::from_u8(tier).ok_or(DawnError::InvalidTier)?;
        DawnApp::revoke_ip(ctx, tier_enum)
    }

    // Proof of Bandwidth Instructions
    pub fn register_prover(ctx: Context<RegisterProver>) -> Result<()> {
        DawnApp::register_prover(ctx)
    }

    pub fn register_challenger(ctx: Context<RegisterChallenger>) -> Result<()> {
        DawnApp::register_challenger(ctx)
    }

    pub fn init_challenge_round(
        ctx: Context<InitChallengeRound>,
        seed: [u8; 32],
        n_packets: u32,
        n_rounds: u16,
        start_slot: u64,
        end_slot: u64,
        data_anchor_root: [u8; 32],
    ) -> Result<()> {
        DawnApp::init_challenge_round(ctx, seed, n_packets, n_rounds, start_slot, end_slot, data_anchor_root)
    }

    pub fn emit_session_commitment(
        ctx: Context<EmitSessionCommitment>,
        da_pointer: [u8; 32],
    ) -> Result<()> {
        DawnApp::emit_session_commitment(ctx, da_pointer)
    }

    pub fn submit_min_hash(
        ctx: Context<SubmitMinHash>,
        leaf: SessionLeaf,
        proof: MerkleProof,
        min_token: [u8; 32],
        da_timestamp: u64,
    ) -> Result<()> {
        DawnApp::submit_min_hash(ctx, leaf, proof, min_token, da_timestamp)
    }

    pub fn finalize_aggregator(
        ctx: Context<FinalizeAggregator>,
        da_snapshot_pointer: [u8; 32],
    ) -> Result<()> {
        DawnApp::finalize_aggregator(ctx, da_snapshot_pointer)
    }

    pub fn close_round(ctx: Context<CloseRound>) -> Result<()> {
        DawnApp::close_round(ctx)
    }

    pub fn close_aggregator(ctx: Context<CloseAggregator>) -> Result<()> {
        DawnApp::close_aggregator(ctx)
    }
}
