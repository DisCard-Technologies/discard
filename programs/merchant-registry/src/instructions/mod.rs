//! Instruction handlers for the merchant registry

pub mod initialize_registry;
pub mod register_merchant;
pub mod update_merchant;
pub mod revoke_merchant;

pub use initialize_registry::*;
pub use register_merchant::*;
pub use update_merchant::*;
pub use revoke_merchant::*;
