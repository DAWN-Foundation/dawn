use std::cmp::min;

/// Helper to store a trimmed String into a fixed [u8; 32] array
/// Used when persisting String inputs into fixed-size account fields
pub fn string_to_fixed_bytes(input: &str) -> [u8; 32] {
    let trimmed = input.trim();
    let bytes = trimmed.as_bytes();
    let mut result = [0u8; 32];
    let copy_len = min(bytes.len(), 32);
    result[..copy_len].copy_from_slice(&bytes[..copy_len]);
    result
}
