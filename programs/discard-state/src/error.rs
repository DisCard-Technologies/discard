//! Program-level errors for DisCard State

use anchor_lang::prelude::*;

#[error_code]
pub enum DisCardError {
    #[msg("Invalid compressed proof")]
    InvalidProof,

    #[msg("Unauthorized: signer does not own this account")]
    Unauthorized,

    #[msg("Account not found in Merkle tree")]
    AccountNotFound,

    #[msg("Invalid Merkle root")]
    InvalidMerkleRoot,

    #[msg("State hash mismatch")]
    StateHashMismatch,

    #[msg("Invalid state transition")]
    InvalidStateTransition,

    #[msg("Light Protocol error")]
    LightProtocolError,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Invalid account type")]
    InvalidAccountType,

    #[msg("Account already exists")]
    AccountAlreadyExists,

    #[msg("Invalid instruction data")]
    InvalidInstructionData,

    #[msg("Program paused")]
    ProgramPaused,
}
