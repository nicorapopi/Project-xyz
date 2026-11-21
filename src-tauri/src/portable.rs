use crate::{
    vault::{self, VaultKey},
    workspace::StoreError,
};
use argon2::{Algorithm, Argon2, Params, Version};
use zeroize::Zeroizing;

const MAGIC: &[u8; 16] = b"NEXADESK-BACKUP\x01";
const SALT_BYTES: usize = 16;
const NONCE_BYTES: usize = 12;
const HEADER_BYTES: usize = MAGIC.len() + SALT_BYTES + NONCE_BYTES;
pub const OVERHEAD: u64 = (HEADER_BYTES + 16) as u64;
pub const EXTENSION: &str = "nexabackup";

pub fn validate_passphrase(passphrase: &str) -> Result<(), StoreError> {
    if passphrase.len() > 256 || passphrase.chars().count() < 12 || passphrase.trim().is_empty() {
        return Err(StoreError::Passphrase);
    }
    Ok(())
}

fn derive_key(passphrase: &str, salt: &[u8]) -> Result<VaultKey, StoreError> {
    validate_passphrase(passphrase)?;
    // RFC 9106's memory-constrained profile. The file cannot supply resource costs.
    let params = Params::new(65_536, 3, 4, Some(32)).map_err(|_| StoreError::Blocked)?;
    let mut key = Zeroizing::new([0; 32]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(passphrase.as_bytes(), salt, &mut *key)
        .map_err(|_| StoreError::Blocked)?;
    Ok(key)
}

pub fn seal(plaintext: &[u8], passphrase: &str) -> Result<Vec<u8>, StoreError> {
    let mut salt = [0; SALT_BYTES];
    getrandom::fill(&mut salt).map_err(|_| StoreError::Blocked)?;
    let key = derive_key(passphrase, &salt)?;
    let (nonce, ciphertext) = vault::seal_payload(plaintext, &key, MAGIC)?;
    let mut file = Vec::with_capacity(HEADER_BYTES + ciphertext.len());
    file.extend_from_slice(MAGIC);
    file.extend_from_slice(&salt);
    file.extend_from_slice(&nonce);
    file.extend_from_slice(&ciphertext);
    Ok(file)
}

pub fn open(file: &[u8], passphrase: &str) -> Result<Zeroizing<Vec<u8>>, StoreError> {
    if file.len() < OVERHEAD as usize || !file.starts_with(MAGIC) {
        return Err(StoreError::BackupInvalid);
    }
    let salt_end = MAGIC.len() + SALT_BYTES;
    let key = derive_key(passphrase, &file[MAGIC.len()..salt_end])?;
    let nonce = file[salt_end..HEADER_BYTES]
        .try_into()
        .map_err(|_| StoreError::BackupInvalid)?;
    vault::open_payload(&file[HEADER_BYTES..], nonce, &key, MAGIC)
        .map_err(|_| StoreError::BackupAuthentication)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_a_fresh_salt_and_rejects_wrong_passphrases_and_tampering() {
        let passphrase = "test phrase with multiple words";
        let data = b"example workspace";
        let first = seal(data, passphrase).unwrap();
        let mut second = seal(data, passphrase).unwrap();
        assert_ne!(first[..HEADER_BYTES], second[..HEADER_BYTES]);
        assert_eq!(open(&first, passphrase).unwrap().as_slice(), data);
        assert!(matches!(
            open(&first, "different test phrase"),
            Err(StoreError::BackupAuthentication)
        ));
        *second.last_mut().unwrap() ^= 1;
        assert!(matches!(
            open(&second, passphrase),
            Err(StoreError::BackupAuthentication)
        ));
        assert!(matches!(
            open(b"unknown format", passphrase),
            Err(StoreError::BackupInvalid)
        ));
    }
}
