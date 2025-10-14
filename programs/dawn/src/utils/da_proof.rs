// programs/dawn/src/da_proof.rs
use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

/// Keep this EXACT across your indexer + on-chain code.
/// Prefix avoids cross-protocol collisions.
const DOMAIN_COMBINE: &[u8] = b"DA-MERKLE:v1";
const DOMAIN_LEAF: &[u8] = b"DA-LEAF:v1";

/// Leaf construction for a session blob: (challenger, prover, round, packet_root, N)
/// Keep this consistent with what your uploader emits.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SessionLeaf {
    pub challenger: Pubkey,
    pub prover: Pubkey,
    pub round_id: u64,
    pub packet_root: [u8; 32],
    pub n: u32,
}

impl SessionLeaf {
    pub fn hash(&self) -> [u8; 32] {
        let mut buf = Vec::with_capacity(1 + 32 + 32 + 8 + 32 + 4);
        buf.extend_from_slice(self.challenger.as_ref());
        buf.extend_from_slice(self.prover.as_ref());
        buf.extend_from_slice(&self.round_id.to_le_bytes());
        buf.extend_from_slice(&self.packet_root);
        buf.extend_from_slice(&self.n.to_le_bytes());
        // domain separated leaf
        let h = hashv(&[DOMAIN_LEAF, &buf]);
        h.as_ref().try_into().unwrap()
    }
}

/// If you **don’t** want to send direction bits, you can combine
/// by ordered hashing (lexicographic): H(DOMAIN, min||max).
fn combine_ordered(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
    let h = hashv(&[DOMAIN_COMBINE, lo, hi]);
    h.as_ref().try_into().unwrap()
}

/// Minimal Merkle proof: list of sibling hashes. Order-insensitive using combine_ordered.
/// (Alternative: include direction bits and concatenate left||right deterministically.)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MerkleProof {
    pub siblings: Vec<[u8; 32]>,
}

impl MerkleProof {
    pub fn compute_root(&self, mut leaf: [u8; 32]) -> [u8; 32] {
        for sib in &self.siblings {
            leaf = combine_ordered(&leaf, sib);
        }
        leaf
    }
}