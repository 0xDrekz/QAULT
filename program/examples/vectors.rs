//! Prints test vectors for the browser client: `cargo run --example vectors`.
use qault_vault::{vault_address, wots};
use solana_program::pubkey::Pubkey;

fn hex(b: &[u8]) -> String { b.iter().map(|x| format!("{x:02x}")).collect() }

fn main() {
    let program = Pubkey::new_from_array([7u8; 32]);
    let mut out = vec![];
    for (seed_byte, index) in [(42u8, 0u32), (42, 1), (1, 77)] {
        let seed = [seed_byte; 32];
        let k = wots::Key::derive(&seed, index);
        let pk = k.pubkey_hash();
        let (vault, bump) = vault_address(&program, &pk);
        let to = Pubkey::new_from_array([3u8; 32]);
        let refund = Pubkey::new_from_array([4u8; 32]);
        let amount = 1_234_567_890u64 + index as u64;
        let (nonce, m) = wots::grind(&program.to_bytes(), &vault.to_bytes(), &to.to_bytes(), &refund.to_bytes(), amount);
        out.push(format!(
            r#"{{"seed":"{}","index":{},"salt":"{}","pubkeyHash":"{}","vault":"{}","bump":{},"to":"{}","refund":"{}","amount":"{}","nonce":{},"message":"{}","signature":"{}"}}"#,
            hex(&seed), index, hex(&k.salt), hex(&pk), vault, bump, to, refund, amount, nonce, hex(&m), hex(&k.sign(&m))
        ));
    }
    println!("{{\"program\":\"{}\",\"vectors\":[{}]}}", program, out.join(","));
}
