/* The waitlist form: any <form data-join> on the page. One box takes an
   email or a Solana wallet address; we work out which. */
(() => {
  const forms = document.querySelectorAll("form[data-join]");
  if (!forms.length) return;
  const isAddress = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);

  // social proof once there is some
  fetch("/api/waitlist/count").then(r => r.json()).then(({ count }) => {
    if (count >= 25) document.querySelectorAll("[data-join-count]").forEach(el => {
      el.textContent = `Join ${count.toLocaleString("en-US")} people already waiting.`;
    });
  }).catch(() => {});

  for (const form of forms) {
    const input = form.querySelector("input[name=contact]");
    const btn = form.querySelector("button");
    const msg = form.parentElement.querySelector("[data-join-msg]");
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const v = input.value.trim();
      const body = isAddress(v) ? { wallet: v } : { email: v };
      body.website = form.querySelector("input[name=website]")?.value || "";
      btn.disabled = true;
      msg.className = "join-msg";
      msg.textContent = "Adding you…";
      try {
        const r = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json();
        if (j.error) throw new Error(j.error);
        msg.className = "join-msg ok";
        msg.textContent = j.already
          ? `You're already on the list, at number ${j.position}.`
          : `You're in, at number ${j.position}. We'll be in touch before mainnet opens.`;
        form.reset();
      } catch (err) {
        msg.className = "join-msg err";
        msg.textContent = err.message || "Something went wrong. Try again.";
      } finally {
        btn.disabled = false;
      }
    });
  }
})();
