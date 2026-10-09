/* Where the vault lives. Devnet only until the program is audited. */

export const NETWORK = "devnet";
export const PROGRAM_ID = "FFLcbagW5VPNhbnnD2cvGVWM8XSmfouoXAv3xds3Bkzy";
export const explorer = (kind, id) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`;

/* Compute budget for a withdraw. The hardest signature the wallet will
   produce costs ~550k units (see MAX_WORK in wots.js). */
export const WITHDRAW_UNITS = 700_000;
