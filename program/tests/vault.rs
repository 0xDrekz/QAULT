//! The compiled program, run in LiteSVM. Build it first: `cargo build-sbf`.

use litesvm::LiteSVM;
use qault_vault::{vault_address, wots, WITHDRAW};
use solana_compute_budget_interface::ComputeBudgetInstruction;
use solana_instruction::{AccountMeta, Instruction};
use solana_keypair::Keypair;
use solana_program::pubkey::Pubkey;
use solana_signer::Signer;
use solana_transaction::Transaction;

const SEED: [u8; 32] = [42u8; 32];
const SOL: u64 = 1_000_000_000;

fn program_id() -> Pubkey {
    Pubkey::new_from_array([7u8; 32])
}

fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(program_id(), "target/deploy/qault_vault.so").expect("run `cargo build-sbf` first");
    let payer = Keypair::new();
    svm.airdrop(&payer.pubkey(), 10 * SOL).unwrap();
    (svm, payer)
}

fn vault(index: u32) -> (wots::Key, Pubkey, u8) {
    let k = wots::Key::derive(&SEED, index);
    let (addr, bump) = vault_address(&program_id(), &k.pubkey_hash());
    (k, addr, bump)
}

fn withdraw_ix(k: &wots::Key, vault: Pubkey, bump: u8, to: Pubkey, refund: Pubkey, amount: u64, sign_amount: u64) -> Instruction {
    let (nonce, m) = wots::grind(&program_id().to_bytes(), &vault.to_bytes(), &to.to_bytes(), &refund.to_bytes(), sign_amount);
    let mut data = vec![WITHDRAW];
    data.extend_from_slice(&k.salt);
    data.push(bump);
    data.extend_from_slice(&amount.to_le_bytes());
    data.extend_from_slice(&nonce.to_le_bytes());
    data.extend_from_slice(&k.sign(&m));
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(vault, false),
            AccountMeta::new(to, false),
            AccountMeta::new(refund, false),
            AccountMeta::new_readonly(solana_system_interface::program::ID, false),
        ],
        data,
    }
}

fn send(svm: &mut LiteSVM, payer: &Keypair, ix: Instruction) -> Result<u64, String> {
    let tx = Transaction::new_signed_with_payer(
        &[ComputeBudgetInstruction::set_compute_unit_limit(1_200_000), ix],
        Some(&payer.pubkey()),
        &[payer],
        svm.latest_blockhash(),
    );
    let size = bincode_len(&tx);
    assert!(size <= 1232, "transaction is {size} bytes, over Solana's 1232 limit");
    println!("transaction is {size} bytes");
    svm.send_transaction(tx).map(|m| m.compute_units_consumed).map_err(|e| format!("{:?}", e.err))
}

fn bincode_len(tx: &Transaction) -> usize {
    // signatures + message, as on the wire
    let msg = tx.message.serialize();
    1 + 64 * tx.signatures.len() + msg.len()
}

fn bal(svm: &LiteSVM, a: &Pubkey) -> u64 {
    svm.get_balance(a).unwrap_or(0)
}

#[test]
fn deposit_send_and_rotate() {
    let (mut svm, payer) = setup();
    let (k0, v0, b0) = vault(0);
    let (_, v1, _) = vault(1);
    let friend = Pubkey::new_unique();

    // depositing is a plain transfer — here, an airdrop to the address
    svm.airdrop(&v0, 5 * SOL).unwrap();

    let cu = send(&mut svm, &payer, withdraw_ix(&k0, v0, b0, friend, v1, 2 * SOL, 2 * SOL)).unwrap();
    println!("withdraw used {cu} compute units");

    assert_eq!(bal(&svm, &friend), 2 * SOL);
    assert_eq!(bal(&svm, &v1), 3 * SOL);
    assert_eq!(bal(&svm, &v0), 0, "the spent vault ends empty");
}

#[test]
fn the_next_vault_spends_too() {
    let (mut svm, payer) = setup();
    let (k0, v0, b0) = vault(0);
    let (k1, v1, b1) = vault(1);
    let (_, v2, _) = vault(2);
    let friend = Pubkey::new_unique();
    svm.airdrop(&v0, 5 * SOL).unwrap();
    send(&mut svm, &payer, withdraw_ix(&k0, v0, b0, friend, v1, SOL, SOL)).unwrap();
    svm.expire_blockhash();
    send(&mut svm, &payer, withdraw_ix(&k1, v1, b1, friend, v2, SOL, SOL)).unwrap();
    assert_eq!(bal(&svm, &friend), 2 * SOL);
    assert_eq!(bal(&svm, &v2), 3 * SOL);
}

#[test]
fn send_everything() {
    let (mut svm, payer) = setup();
    let (k0, v0, b0) = vault(0);
    let (_, v1, _) = vault(1);
    let friend = Pubkey::new_unique();
    svm.airdrop(&v0, 5 * SOL).unwrap();
    send(&mut svm, &payer, withdraw_ix(&k0, v0, b0, friend, v1, 5 * SOL, 5 * SOL)).unwrap();
    assert_eq!(bal(&svm, &friend), 5 * SOL);
    assert_eq!(bal(&svm, &v1), 0);
}

#[test]
fn signature_for_a_different_amount_fails() {
    let (mut svm, payer) = setup();
    let (k0, v0, b0) = vault(0);
    let (_, v1, _) = vault(1);
    svm.airdrop(&v0, 5 * SOL).unwrap();
    // signed for 1 SOL, asks for 4
    assert!(send(&mut svm, &payer, withdraw_ix(&k0, v0, b0, Pubkey::new_unique(), v1, 4 * SOL, SOL)).is_err());
    assert_eq!(bal(&svm, &v0), 5 * SOL);
}

#[test]
fn a_thief_cant_redirect_a_signed_payment() {
    let (mut svm, payer) = setup();
    let (k0, v0, b0) = vault(0);
    let (_, v1, _) = vault(1);
    let friend = Pubkey::new_unique();
    let thief = Pubkey::new_unique();
    svm.airdrop(&v0, 5 * SOL).unwrap();

    // a genuine signature to `friend`, with the destination swapped for the thief
    let mut ix = withdraw_ix(&k0, v0, b0, friend, v1, SOL, SOL);
    ix.accounts[1].pubkey = thief;
    assert!(send(&mut svm, &payer, ix).is_err());

    // or with the change sent to the thief instead of the next vault
    let mut ix = withdraw_ix(&k0, v0, b0, friend, v1, SOL, SOL);
    ix.accounts[2].pubkey = thief;
    assert!(send(&mut svm, &payer, ix).is_err());

    assert_eq!(bal(&svm, &v0), 5 * SOL);
    assert_eq!(bal(&svm, &thief), 0);
}

#[test]
fn another_vaults_key_cant_spend() {
    let (mut svm, payer) = setup();
    let (_, v0, b0) = vault(0);
    let (k9, _, _) = vault(9);
    let (_, v1, _) = vault(1);
    svm.airdrop(&v0, 5 * SOL).unwrap();
    assert!(send(&mut svm, &payer, withdraw_ix(&k9, v0, b0, Pubkey::new_unique(), v1, SOL, SOL)).is_err());
}

#[test]
fn a_tampered_signature_fails() {
    let (mut svm, payer) = setup();
    let (k0, v0, b0) = vault(0);
    let (_, v1, _) = vault(1);
    svm.airdrop(&v0, 5 * SOL).unwrap();
    let mut ix = withdraw_ix(&k0, v0, b0, Pubkey::new_unique(), v1, SOL, SOL);
    let last = ix.data.len() - 1;
    ix.data[last] ^= 1;
    assert!(send(&mut svm, &payer, ix).is_err());
}

#[test]
fn the_most_expensive_allowed_signature_fits_the_compute_budget() {
    // find a payment whose digest sits right at the cost ceiling
    let (mut svm, payer) = setup();
    let (k0, v0, b0) = vault(0);
    let (_, v1, _) = vault(1);
    svm.airdrop(&v0, 5 * SOL).unwrap();
    let to = Pubkey::new_unique();
    let mut worst = (0u32, 0u64, 0u32);
    for i in 1..400u64 {
        let amount = i * 1_000_000; // new accounts need at least ~0.00089 SOL
        let (nonce, m) = wots::grind(&program_id().to_bytes(), &v0.to_bytes(), &to.to_bytes(), &v1.to_bytes(), amount);
        let w = wots::work(&m);
        if w > worst.0 { worst = (w, amount, nonce); }
    }
    let cu = send(&mut svm, &payer, withdraw_ix(&k0, v0, b0, to, v1, worst.1, worst.1)).unwrap();
    println!("hardest of 400 payments: {} hashes, {} compute units", worst.0, cu);
    assert!(cu < 1_000_000);
}

#[test]
fn a_replay_only_ever_pays_the_owners_choices() {
    let (mut svm, payer) = setup();
    let (k0, v0, b0) = vault(0);
    let (_, v1, _) = vault(1);
    let friend = Pubkey::new_unique();
    svm.airdrop(&v0, 5 * SOL).unwrap();
    let ix = withdraw_ix(&k0, v0, b0, friend, v1, SOL, SOL);
    send(&mut svm, &payer, ix.clone()).unwrap();
    // empty now: the same transaction again does nothing
    svm.expire_blockhash();
    assert!(send(&mut svm, &payer, ix).is_err());
    assert_eq!(bal(&svm, &friend), SOL);
}
