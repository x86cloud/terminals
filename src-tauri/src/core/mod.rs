pub mod crypto;
pub mod models;
pub mod storage;
pub mod store;

pub use crypto::*;
pub use models::*;
pub use store::*;

use std::sync::atomic::{AtomicBool, Ordering};

pub const APP_VERSION: &str = "v1.1.1";
pub const GIT_COMMIT: &str = "tauri-v4";
pub const BUILD_DATE: &str = "2026-10-28";

static IS_APP_QUITTING: AtomicBool = AtomicBool::new(false);

pub fn set_app_quitting(q: bool) {
    IS_APP_QUITTING.store(q, Ordering::SeqCst);
}

pub fn is_app_quitting() -> bool {
    IS_APP_QUITTING.load(Ordering::SeqCst)
}

