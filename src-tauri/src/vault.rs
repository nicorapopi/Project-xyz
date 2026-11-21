use crate::workspace::StoreError;
use aes_gcm_siv::{
    aead::{Aead, KeyInit, Payload},
    Aes256GcmSiv, Nonce,
};
use base64::{engine::general_purpose::STANDARD_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

const SERVICE: &str = "com.nexadesk.workspace";
const ACCOUNT: &str = "workspace-encryption-v3";
const AAD: &[u8] = b"NexaDesk workspace envelope v3";
const KEY_BYTES: usize = 32;

pub type VaultKey = Zeroizing<[u8; KEY_BYTES]>;

pub trait KeyStore: Send {
    fn load(&self) -> Result<Option<VaultKey>, StoreError>;
    fn store(&self, key: &VaultKey) -> Result<(), StoreError>;
}

pub struct OsKeyStore;

impl OsKeyStore {
    fn entry() -> Result<keyring::Entry, StoreError> {
        if !cfg!(any(target_os = "windows", target_os = "macos")) {
            return Err(StoreError::KeyUnavailable);
        }
        keyring::Entry::new(SERVICE, ACCOUNT).map_err(|_| StoreError::KeyUnavailable)
    }
}

impl KeyStore for OsKeyStore {
    fn load(&self) -> Result<Option<VaultKey>, StoreError> {
        match Self::entry()?.get_secret() {
            Ok(bytes) => {
                let bytes = Zeroizing::new(bytes);
                let key = <[u8; KEY_BYTES]>::try_from(bytes.as_slice())
                    .map_err(|_| StoreError::KeyUnavailable)?;
                Ok(Some(Zeroizing::new(key)))
            }
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(StoreError::KeyUnavailable),
        }
    }

    fn store(&self, key: &VaultKey) -> Result<(), StoreError> {
        Self::entry()?
            .set_secret(key.as_ref())
            .map_err(|_| StoreError::KeyUnavailable)
    }
}

pub fn load_or_create_key(keys: &dyn KeyStore) -> Result<VaultKey, StoreError> {
    if let Some(key) = keys.load()? {
        return Ok(key);
    }
    let mut key = Zeroizing::new([0; KEY_BYTES]);
    getrandom::fill(&mut *key).map_err(|_| StoreError::KeyUnavailable)?;
    keys.store(&key)?;
    // Confirm the generated key is retrievable before replacing the plaintext workspace.
    let persisted = keys.load()?.ok_or(StoreError::KeyUnavailable)?;
    if *persisted != *key {
        return Err(StoreError::KeyUnavailable);
    }
    Ok(persisted)
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Envelope {
    version: u8,
    nonce: [u8; 12],
    ciphertext: String,
}

pub fn seal_payload(
    plaintext: &[u8],
    key: &VaultKey,
    aad: &[u8],
) -> Result<([u8; 12], Vec<u8>), StoreError> {
    let cipher =
        Aes256GcmSiv::new_from_slice(key.as_ref()).map_err(|_| StoreError::KeyUnavailable)?;
    let mut nonce = [0; 12];
    getrandom::fill(&mut nonce).map_err(|_| StoreError::Blocked)?;
    let ciphertext = cipher
        .encrypt(
            &Nonce::from(nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| StoreError::Blocked)?;
    Ok((nonce, ciphertext))
}

pub fn open_payload(
    ciphertext: &[u8],
    nonce: [u8; 12],
    key: &VaultKey,
    aad: &[u8],
) -> Result<Zeroizing<Vec<u8>>, StoreError> {
    let cipher =
        Aes256GcmSiv::new_from_slice(key.as_ref()).map_err(|_| StoreError::KeyUnavailable)?;
    let decrypted = cipher
        .decrypt(
            &Nonce::from(nonce),
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map_err(|_| StoreError::Corrupt)?;
    Ok(Zeroizing::new(decrypted))
}

pub fn seal(snapshot: &[u8], key: &VaultKey) -> Result<Vec<u8>, StoreError> {
    let (nonce, ciphertext) = seal_payload(snapshot, key, AAD)?;
    let envelope = Envelope {
        version: 3,
        nonce,
        ciphertext: STANDARD_NO_PAD.encode(ciphertext),
    };
    serde_json::to_vec(&envelope).map_err(|_| StoreError::Blocked)
}

pub fn open(
    envelope: Envelope,
    keys: &dyn KeyStore,
) -> Result<(Zeroizing<Vec<u8>>, VaultKey), StoreError> {
    if envelope.version != 3 {
        return Err(StoreError::Corrupt);
    }
    let bytes = STANDARD_NO_PAD
        .decode(envelope.ciphertext)
        .map_err(|_| StoreError::Corrupt)?;
    let key = keys.load()?.ok_or(StoreError::KeyUnavailable)?;
    Ok((open_payload(&bytes, envelope.nonce, &key, AAD)?, key))
}
