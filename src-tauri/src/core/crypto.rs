use crate::core::storage;
use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rand::RngCore;
use std::fs;

const ENC_PREFIX: &str = "enc:v1:";

pub struct SecretBox {
    cipher: Aes256Gcm,
}

impl SecretBox {
    pub fn new(key: &[u8; 32]) -> Self {
        let cipher = Aes256Gcm::new(key.into());
        Self { cipher }
    }

    pub fn encrypt(&self, plain: &str) -> String {
        if plain.is_empty() {
            return String::new();
        }
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        match self.cipher.encrypt(nonce, plain.as_bytes()) {
            Ok(ciphertext) => {
                let mut sealed = Vec::with_capacity(12 + ciphertext.len());
                sealed.extend_from_slice(&nonce_bytes);
                sealed.extend_from_slice(&ciphertext);
                format!("{}{}", ENC_PREFIX, BASE64.encode(sealed))
            }
            Err(_) => plain.to_string(),
        }
    }

    pub fn decrypt(&self, value: &str) -> String {
        if !value.starts_with(ENC_PREFIX) {
            return value.to_string();
        }
        let encoded = &value[ENC_PREFIX.len()..];
        let raw = match BASE64.decode(encoded) {
            Ok(b) if b.len() > 12 => b,
            _ => return String::new(),
        };
        let (nonce_bytes, cipher_bytes) = raw.split_at(12);
        let nonce = Nonce::from_slice(nonce_bytes);
        match self.cipher.decrypt(nonce, cipher_bytes) {
            Ok(plain) => String::from_utf8(plain).unwrap_or_default(),
            Err(_) => String::new(),
        }
    }
}

pub fn load_or_create_key() -> Result<[u8; 32], String> {
    let key_path = storage::secret_key_path();
    if let Ok(data) = fs::read(&key_path) {
        if data.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&data);
            return Ok(key);
        }
    }
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    storage::write_file_atomic(&key_path, &key)?;
    Ok(key)
}

