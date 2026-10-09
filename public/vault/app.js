/* QAULT Vault — the page. Views: welcome → create/restore → dashboard. */

import * as W from "./wallet.js";
import * as sol from "./solana.js";
import { PROGRAM_ID, explorer } from "./config.js";

const app = document.querySelector("#app");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sol$ = l => (l / sol.LAMPORTS).toLocaleString("en-US", { maximumFractionDigits: 6 });
const short = a => a.slice(0, 4) + "…" + a.slice(-4);
const link = (kind, id, text) => `<a href="${explorer(kind, id)}" target="_blank" rel="noopener">${esc(text)}</a>`;
const later = () => new Promise(r => setTimeout(r, 30));   // let the page paint before heavy maths

const pl = document.querySelector("#program-link");
pl.textContent = short(PROGRAM_ID);
pl.href = explorer("address", PROGRAM_ID);

let wallet = null;
let state = null;   // the last scan

/* ---------- welcome ---------- */

function welcome() {
  app.innerHTML = `
    <section class="v-hero">
      <p class="eyebrow fade-in" style="--d:.05s">QAULT Vault · devnet</p>
      <h1 class="fade-in" style="--d:.15s">A vault quantum computers <em>can't open.</em></h1>
      <p class="lede fade-in" style="--d:.35s">Normal wallets are locked with a key a future quantum computer could work out. A QAULT vault is locked with a <em>one-time hash-based key</em>, maths quantum computers are bad at. Every time you spend, your funds move to a fresh vault with a fresh key. You won't notice: you'll just see a balance and a send button.</p>
      <div class="row fade-in" style="--d:.5s">
        <button class="btn" data-go="create">Create a vault <span class="arrow" aria-hidden="true">→</span></button>
        <button class="btn ghost" data-go="restore">Restore from recovery phrase</button>
      </div>
      <p class="fine fade-in" style="--d:.6s">Waiting for real SOL? <a href="/#waitlist">Join the mainnet waitlist</a>.</p>
    </section>
    ${how()}`;
}

function how() {
  return `
    <section class="panel how">
      <h2>How it works</h2>
      <ol>
        <li><strong>One recovery phrase</strong> (24 words) creates every vault you'll ever use, plus a small "fuel" key that pays Solana's network fees.</li>
        <li><strong>Your vault's address</strong> comes from a one-time Winternitz public key. No normal private key exists for it, so there's nothing for a quantum computer to crack.</li>
        <li><strong>To send</strong>, your browser signs <em>who gets paid, how much, and where the change goes</em> with the one-time key. The QAULT program checks it, pays out, and moves the rest to your next vault.</li>
        <li><strong>The used key is retired.</strong> It's been partly revealed, so it's never used again, and the old vault is left empty.</li>
        <li><strong>The fuel key can't touch your funds.</strong> The signature fixes where every coin goes, so even someone holding the fuel key, or copying your transaction, can't redirect anything.</li>
      </ol>
    </section>`;
}

/* ---------- create ---------- */

let draft = null;

function create() {
  draft = W.newPhrase();
  const words = draft.split(" ");
  app.innerHTML = `
    <section class="panel blur" id="phrase-panel" style="margin-top:32px">
      <h2>Your recovery phrase</h2>
      <p>These 24 words are the only way to get your vault back. Write them down, in order, and keep them somewhere safe. Anyone with them can spend from your vault. QAULT can't recover them for you.</p>
      <div class="words">${words.map((w, i) => `<span><b>${i + 1}</b>${w}</span>`).join("")}</div>
      <div class="row">
        <button class="btn ghost small" id="reveal">Show words</button>
        <button class="btn" id="written" disabled>I've written them down</button>
        <button class="btn ghost" data-go="welcome">Back</button>
      </div>
    </section>`;
  document.querySelector("#reveal").onclick = e => {
    document.querySelector("#phrase-panel").classList.remove("blur");
    e.target.remove();
    document.querySelector("#written").disabled = false;
  };
  document.querySelector("#written").onclick = confirmPhrase;
}

function confirmPhrase() {
  const words = draft.split(" ");
  const ask = [];
  while (ask.length < 3) { const n = Math.floor(Math.random() * 24); if (!ask.includes(n)) ask.push(n); }
  ask.sort((a, b) => a - b);
  app.innerHTML = `
    <section class="panel" style="margin-top:32px">
      <h2>Check you've got them</h2>
      <p>Type these words from your phrase.</p>
      <form id="confirm">
        ${ask.map(n => `<label class="field"><span>Word ${n + 1}</span><input data-n="${n}" autocomplete="off" autocapitalize="none" spellcheck="false" required></label>`).join("")}
        <div class="row"><button class="btn">Create my vault</button><button type="button" class="btn ghost" data-go="create">Start over</button></div>
        <p class="msg err" id="confirm-msg"></p>
      </form>
    </section>`;
  document.querySelector("#confirm").onsubmit = async e => {
    e.preventDefault();
    const ok = [...e.target.querySelectorAll("input")].every(i => i.value.trim().toLowerCase() === words[+i.dataset.n]);
    if (!ok) { document.querySelector("#confirm-msg").textContent = "One of those doesn't match. Check your written copy."; return; }
    await begin(draft, { fresh: true });
  };
}

/* ---------- restore ---------- */

function restore() {
  app.innerHTML = `
    <section class="panel" style="margin-top:32px">
      <h2>Restore from recovery phrase</h2>
      <p>Enter your 24 words, separated by spaces. QAULT will find every vault they created.</p>
      <form id="restore">
        <label class="field"><span>Recovery phrase</span><textarea id="phrase" autocomplete="off" autocapitalize="none" spellcheck="false" required></textarea></label>
        <div class="row"><button class="btn">Restore</button><button type="button" class="btn ghost" data-go="welcome">Back</button></div>
        <p class="msg err" id="restore-msg"></p>
      </form>
    </section>`;
  document.querySelector("#restore").onsubmit = async e => {
    e.preventDefault();
    const p = document.querySelector("#phrase").value;
    if (!W.validPhrase(p)) { document.querySelector("#restore-msg").textContent = "That isn't a valid recovery phrase. Check the spelling and the order."; return; }
    await begin(p, { fresh: false });
  };
}

/* ---------- open a wallet ---------- */

async function begin(phrase, { fresh }) {
  app.innerHTML = `<section class="panel" style="margin-top:32px"><div class="loading"><div class="orb"></div>${fresh ? "Creating your first vault…" : "Finding your vaults…"}</div></section>`;
  await later();
  wallet = W.open(phrase);
  W.save(wallet);
  draft = null;
  await dashboard();
}

/* ---------- dashboard ---------- */

async function dashboard() {
  app.innerHTML = `<section class="panel" style="margin-top:32px"><div class="loading"><div class="orb"></div>Reading your vaults from devnet…</div></section>`;
  await later();
  try {
    await refresh();
  } catch (e) {
    app.innerHTML = `<section class="panel" style="margin-top:32px"><p class="msg err">${esc(e.message)}</p><button class="btn ghost" id="retry">Try again</button></section>`;
    document.querySelector("#retry").onclick = dashboard;
  }
}

async function refresh() {
  if (!wallet) return;
  state = await W.scan(wallet);
  [state.fuel] = await sol.balances([wallet.fuel.address]);
  const p = W.pending();
  if (p && p.index !== state.current.index) W.discardPending();   // it landed, or that vault moved on
  render();
}

function render() {
  const { list, current, fuel } = state;
  const p = W.pending();
  const busy = app.querySelector("[data-busy]");
  if (busy) return;   // don't redraw under a send in progress

  app.innerHTML = `
    <div style="margin-top:28px" class="stack">
      ${p ? `
      <section class="panel notice">
        <h2>A payment is waiting to land</h2>
        <p>You signed a payment of ${sol$(p.lamports)} SOL to ${esc(short(p.to))}, but it isn't confirmed. Resending it is safe: it's the same signature, so your one-time key isn't used twice.</p>
        <div class="row">
          <button class="btn" id="resend">Resend it</button>
          <button class="btn danger" id="discard">Discard</button>
        </div>
        <ul class="steps" id="resend-steps"></ul>
      </section>` : ""}

      ${!current.lamports && list.length === 1 && W.movable(fuel) < sol.RENT_MIN ? `
      <section class="panel">
        <span class="tag-key">Step 1 of 2</span>
        <h2 style="margin-top:10px">Add some test SOL</h2>
        <p>Your vault is ready. Test SOL is free and has no value. One click fills your vault and keeps a little aside to pay network fees.</p>
        <button class="btn" id="start-sol">Get test SOL <span class="arrow" aria-hidden="true">→</span></button>
        <p class="msg" id="start-msg"></p>
      </section>` : ""}

      <div class="grid2">
        <section class="panel">
          <span class="tag-key">Vault #${current.index} · one-time key</span>
          <div class="balance">${sol$(current.lamports)}<small>SOL</small></div>
          <div class="addr">${link("address", current.address, current.address)}</div>
          <div class="row">
            <button class="btn ghost small" id="copy">Copy address</button>
            <button class="btn ghost small" id="faucet">Get test SOL</button>
            <button class="btn ghost small" id="reload">Refresh</button>
          </div>
          <p class="msg" id="vault-msg"></p>
        </section>

        <section class="panel">
          <h2>Send</h2>
          <form id="send">
            <label class="field"><span>To</span><input id="to" placeholder="Solana address" autocomplete="off" spellcheck="false" required></label>
            <label class="field"><span>Amount (SOL)</span>
              <div class="amount"><input id="amount" inputmode="decimal" placeholder="0.0" autocomplete="off" required><button type="button" class="btn ghost small" id="max">Max</button></div>
            </label>
            <button class="btn" id="send-btn" ${p || !current.lamports ? "disabled" : ""}>Send</button>
          </form>
          <ul class="steps" id="send-steps"></ul>
          <p class="msg err" id="send-msg"></p>
        </section>
      </div>

      <section class="panel">
        <h2>Your vaults</h2>
        <p>Each spend retires a vault's key and moves the change to the next. Old vaults are left empty.</p>
        <table class="vaults">
          <thead><tr><th>#</th><th>Address</th><th>Status</th><th class="hide-sm">Balance</th></tr></thead>
          <tbody>${list.slice().reverse().map(v => `
            <tr>
              <td>${v.index}</td>
              <td class="mono">${link("address", v.address, short(v.address))}</td>
              <td><span class="pill ${v.status}">${v.status === "active" ? "active" : v.status === "fresh" ? "ready" : "spent"}</span></td>
              <td class="hide-sm">${sol$(v.lamports)}</td>
            </tr>`).join("")}</tbody>
        </table>
      </section>

      <div class="grid2">
        <section class="panel">
          <h2>Fuel key</h2>
          <p>Solana makes an ordinary key pay network fees. This one holds a little test SOL for that and has no power over your vault.</p>
          <div class="addr">${link("address", wallet.fuel.address, wallet.fuel.address)}</div>
          <div class="row"><strong>${sol$(fuel)} SOL</strong>
            ${W.movable(fuel) >= sol.RENT_MIN ? `<button class="btn small" id="fuel-move">Move ${sol$(W.movable(fuel))} SOL to vault</button>` : `<button class="btn ghost small" id="fuel-top">Get test SOL</button>`}
          </div>
          <p class="msg" id="fuel-msg"></p>
        </section>

        <section class="panel">
          <h2>Recovery</h2>
          <p>Your phrase is saved in this browser (fine on devnet; a mainnet wallet won't do this). Make sure you have it written down.</p>
          <div class="row">
            <button class="btn ghost small" id="show-phrase">Show recovery phrase</button>
            <button class="btn danger small" id="forget">Forget this device</button>
          </div>
          <div id="phrase-box"></div>
        </section>
      </div>

      ${how()}
    </div>`;

  const $ = s => app.querySelector(s);
  $("#copy").onclick = async () => { try { await navigator.clipboard.writeText(current.address); $("#vault-msg").textContent = "Copied."; } catch { prompt("Copy:", current.address); } };
  $("#reload").onclick = () => refresh().catch(e => ($("#vault-msg").textContent = e.message));
  $("#faucet").onclick = e => testSol(e.target, $("#vault-msg"));
  if ($("#fuel-top")) $("#fuel-top").onclick = e => testSol(e.target, $("#fuel-msg"));
  if ($("#fuel-move")) $("#fuel-move").onclick = e => moveFuel(e.target, $("#fuel-msg"));
  if ($("#start-sol")) $("#start-sol").onclick = e => testSol(e.target, $("#start-msg"));
  $("#max").onclick = () => { $("#amount").value = current.lamports / sol.LAMPORTS; };
  $("#send").onsubmit = e => { e.preventDefault(); send(); };
  $("#show-phrase").onclick = () => {
    $("#phrase-box").innerHTML = `<div class="words">${wallet.phrase.split(" ").map((w, i) => `<span><b>${i + 1}</b>${w}</span>`).join("")}</div>`;
  };
  $("#forget").onclick = () => {
    if (!confirm("Remove this wallet from this browser? You'll need your recovery phrase to get back in.")) return;
    W.forget(); wallet = null; state = null; welcome();
  };
  if (p) {
    $("#resend").onclick = () => resend(p);
    $("#discard").onclick = () => {
      if (!confirm("Discard the signed payment? If you then sign a different one from this vault, its one-time key will have signed twice, which weakens it. Only do this if you're sure the payment failed.")) return;
      W.discardPending(); render();
    };
  }
}

/* Test SOL in one trip: the faucet pays the fuel key, and the fuel key
   keeps enough for fees and moves the rest into the vault. */
async function testSol(btn, out) {
  btn.disabled = true;
  out.className = "msg";
  out.textContent = "Asking the devnet faucet…";
  try {
    await sol.airdrop(wallet.fuel.address, sol.LAMPORTS);
  } catch (e) {
    out.className = "msg err";
    out.innerHTML = /limit|429|dry/i.test(e.message)
      ? `The devnet faucets are rate-limited right now. Get test SOL at <a href="https://faucet.solana.com" target="_blank" rel="noopener">faucet.solana.com</a>, sent to this address (it's copied):<br><code>${esc(wallet.fuel.address)}</code><br>Then press <strong>Refresh</strong>, and <strong>Move to vault</strong>.`
      : esc(e.message);
    try { await navigator.clipboard.writeText(wallet.fuel.address); } catch { /* fine */ }
    btn.disabled = false;
    return;
  }
  out.textContent = "Arrived. Moving it into your vault…";
  await moveFuel(btn, out);
}

async function moveFuel(btn, out) {
  btn.disabled = true;
  out.className = "msg";
  try {
    const [fuel] = await sol.balances([wallet.fuel.address]);
    const { amount } = await W.fuelToVault(wallet, state.current.address, fuel);
    out.className = "msg ok";
    out.textContent = `${sol$(amount)} SOL is in your vault. 0.02 SOL stays on the fuel key for fees.`;
    setTimeout(() => refresh(), 1200);
  } catch (e) {
    out.className = "msg err";
    out.textContent = e.message;
    btn.disabled = false;
  }
}

/* ---------- sending ---------- */

function steps(el, items) {
  el.innerHTML = items.map(([text, cls]) => `<li class="${cls || ""}">${text}</li>`).join("");
}

async function send() {
  const $ = s => app.querySelector(s);
  const to = $("#to").value.trim();
  const amount = Math.round(parseFloat($("#amount").value) * sol.LAMPORTS);
  const msg = $("#send-msg");
  const el = $("#send-steps");
  msg.textContent = "";

  const { current, next, fuel } = state;
  const problem = await W.check(current, to, amount);
  if (problem) { msg.textContent = problem; return; }
  if (fuel < 10_000) { msg.textContent = "The fuel key is out of test SOL for fees. Top it up below."; return; }

  const btn = $("#send-btn");
  btn.disabled = true;
  btn.dataset.busy = "1";
  const all = amount === current.lamports;
  const S = [
    [`Signing with vault #${current.index}'s one-time key`, "doing"],
    ["Sending to devnet", ""],
    [all ? "Vault emptied" : `Change moves to vault #${next.index}, with a fresh key`, ""]
  ];
  steps(el, S);
  await later();

  let record;
  try {
    record = W.prepare(wallet, current, next, to, amount);
    S[0][1] = "done"; S[1][1] = "doing"; steps(el, S);
    const sig = await W.submit(wallet, record);
    S[1] = [`Confirmed · ${link("tx", sig, "view transaction")}`, "done"];
    S[2][1] = "done";
    steps(el, S);
    delete btn.dataset.busy;
    setTimeout(() => refresh(), 1500);
  } catch (e) {
    const i = S.findIndex(s => s[1] === "doing");
    S[i] = [esc(e.message) + (e.sig ? ` · ${link("tx", e.sig, "view")}` : ""), "fail"];
    steps(el, S);
    delete btn.dataset.busy;
    // if it was signed, the pending banner offers a safe resend
    if (record) setTimeout(() => refresh(), 1500);
    else btn.disabled = false;
  }
}

async function resend(p) {
  const el = app.querySelector("#resend-steps");
  app.querySelector("#resend").disabled = true;
  steps(el, [["Resending the same signed payment", "doing"]]);
  try {
    const sig = await W.submit(wallet, p);
    steps(el, [[`Confirmed · ${link("tx", sig, "view transaction")}`, "done"]]);
    setTimeout(() => refresh(), 1500);
  } catch (e) {
    steps(el, [[esc(e.message), "fail"]]);
    app.querySelector("#resend").disabled = false;
  }
}

/* ---------- start ---------- */

app.addEventListener("click", e => {
  const go = e.target.closest("[data-go]")?.dataset.go;
  if (go === "welcome") welcome();
  if (go === "create") create();
  if (go === "restore") restore();
});

const remembered = W.saved();
if (remembered && W.validPhrase(remembered)) { wallet = W.open(remembered); dashboard(); }
else welcome();
