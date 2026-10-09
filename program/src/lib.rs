//! QAULT vault — SOL held behind one-time Winternitz keys.
//!
//! A vault is a program derived address:
//!
//! ```text
//! ["vault", keccak(one-time public key)]
//! ```
//!
//! Nobody holds an Ed25519 key for it — it is off the curve — so the only
//! way to move its SOL is through this program, and the program only does
//! that for a valid Winternitz signature. Depositing needs nothing from
//! the program at all: it is an ordinary transfer to the vault's address.
//!
//! One instruction, Withdraw. It carries a signature over
//! (program, vault, to, refund, amount). The program rebuilds the public
//! key from the signature, checks it hashes to this vault's address, then
//! sends `amount` to `to` and **everything else** to `refund` — normally
//! the owner's next vault, with a fresh key. The vault ends empty, and its
//! key, now partly revealed, is never needed again.
//!
//! The transaction's fee payer is an ordinary key, but it has no power
//! over the funds: the signature fixes where every lamport goes, so a
//! stolen fee-payer key (or a front-runner copying the transaction) can't
//! redirect anything.

pub mod wots;

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
};
use solana_system_interface::instruction as system;

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process);

pub const VAULT_SEED: &[u8] = b"vault";

/// Withdraw: tag, salt, bump, amount, nonce, signature.
pub const WITHDRAW: u8 = 0;
pub const WITHDRAW_LEN: usize = 1 + wots::SALT_LEN + 1 + 8 + 4 + wots::SIG_LEN;

/// The vault address for a one-time key's hash.
pub fn vault_address(program: &Pubkey, pubkey_hash: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[VAULT_SEED, pubkey_hash], program)
}

pub fn process(program: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    match data.first() {
        Some(&WITHDRAW) if data.len() == WITHDRAW_LEN => withdraw(program, accounts, &data[1..]),
        _ => Err(ProgramError::InvalidInstructionData),
    }
}

fn withdraw(program: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let it = &mut accounts.iter();
    let vault = next_account_info(it)?;
    let to = next_account_info(it)?;
    let refund = next_account_info(it)?;
    let system_program = next_account_info(it)?;

    if system_program.key != &solana_system_interface::program::ID {
        return Err(ProgramError::IncorrectProgramId);
    }
    if to.key == vault.key || refund.key == vault.key {
        msg!("a vault can't pay itself");
        return Err(ProgramError::InvalidArgument);
    }

    let mut salt = [0u8; wots::SALT_LEN];
    salt.copy_from_slice(&data[..8]);
    let bump = data[8];
    let amount = u64::from_le_bytes(data[9..17].try_into().unwrap());
    let nonce = u32::from_le_bytes(data[17..21].try_into().unwrap());
    let sig = &data[21..];

    // Who signed? Rebuild the public key from the signature over exactly
    // this payment, and see whether it is the key this vault belongs to.
    let m = wots::message(&program.to_bytes(), &vault.key.to_bytes(), &to.key.to_bytes(), &refund.key.to_bytes(), amount, nonce);
    let pk = wots::recover(&salt, sig, &m).ok_or(ProgramError::InvalidInstructionData)?;
    let expected = Pubkey::create_program_address(&[VAULT_SEED, &pk, &[bump]], program)
        .map_err(|_| ProgramError::InvalidSeeds)?;
    if &expected != vault.key {
        msg!("signature doesn't belong to this vault");
        return Err(ProgramError::MissingRequiredSignature);
    }

    let total = vault.lamports();
    if total == 0 {
        msg!("vault is empty");
        return Err(ProgramError::InsufficientFunds);
    }
    if amount > total {
        msg!("vault holds {} lamports, asked for {}", total, amount);
        return Err(ProgramError::InsufficientFunds);
    }

    let seeds: &[&[u8]] = &[VAULT_SEED, &pk, &[bump]];
    if amount > 0 {
        invoke_signed(
            &system::transfer(vault.key, to.key, amount),
            &[vault.clone(), to.clone(), system_program.clone()],
            &[seeds],
        )?;
    }
    let rest = total - amount;
    if rest > 0 {
        invoke_signed(
            &system::transfer(vault.key, refund.key, rest),
            &[vault.clone(), refund.clone(), system_program.clone()],
            &[seeds],
        )?;
    }
    msg!("sent {} lamports, moved {} to the next vault", amount, rest);
    Ok(())
}
