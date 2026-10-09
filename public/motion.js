/* QAULT — motion. Three things, all switched off for reduced motion:

   1. The hero drawing: the vault's actual protection, drawn like a pen
      plotter. 34 hash chains (one per Winternitz signature digit) run top
      to bottom; a ringed node on each is where a signature reveals it, and
      a brass point walks from there down to the public key at the foot —
      exactly what the program does to check a payment.
   2. Headlines whose words rise in turn, and sections that ease in as
      they scroll into view.
   3. qaultMotion.countUp(el, to, format): numbers that count to their value. */

(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ---------- headline words ---------- */
  for (const h of document.querySelectorAll(".rise")) {
    let i = 0;
    const walk = node => {
      for (const n of [...node.childNodes]) {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const part of n.textContent.split(/(\s+)/)) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { frag.append(part); continue; }
            const w = document.createElement("span"); w.className = "w";
            const inner = document.createElement("span"); inner.textContent = part; inner.style.setProperty("--i", i++);
            w.append(inner); frag.append(w);
          }
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(h);
  }

  /* ---------- reveal on scroll ---------- */
  const io = "IntersectionObserver" in window && !still
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" })
    : null;
  const reveal = root => root.querySelectorAll("[data-reveal]:not(.in)").forEach(el => io ? io.observe(el) : el.classList.add("in"));
  reveal(document);

  /* ---------- count up ---------- */
  function countUp(el, to, format, ms = 1400) {
    if (still || !(to > 0)) { el.textContent = format(to); return; }
    const t0 = performance.now();
    const tick = t => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = format(to * e);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  window.qaultMotion = { countUp, reveal };

  /* ---------- the chain drawing ---------- */
  const canvas = document.querySelector("canvas[data-art]");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const CHAINS = 34, NODES = 24;

  // seeded noise, so the drawing is the same composition every visit
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const chains = Array.from({ length: CHAINS }, (_, i) => ({
    phase: rnd() * Math.PI * 2,
    amp: 0.4 + rnd() * 0.9,
    freq: 1.2 + rnd() * 1.6,
    sig: 3 + Math.floor(rnd() * (NODES - 7)),      // where the signature reveals this chain
    speed: 0.6 + rnd() * 0.8,
    offset: rnd(),
    weight: i % 5 === 0 ? 1.1 : 0.7
  }));

  let w, h, dpr, mx = 0, my = 0, tx = 0, ty = 0;
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    w = canvas.width = Math.round(r.width * dpr);
    h = canvas.height = Math.round(r.height * dpr);
  }

  function point(c, i, k, t) {
    const padX = w * 0.08, padTop = h * 0.06, padBot = h * 0.14;
    const u = k / (NODES - 1);
    const base = padX + (i / (CHAINS - 1)) * (w - 2 * padX);
    const sway = Math.sin(u * c.freq * Math.PI + c.phase + t * 0.00015) * c.amp * (w / CHAINS) * 1.4;
    const lean = (u - 0.5) * (w * 0.05) * Math.sin(c.phase);
    return [base + sway + lean + tx * (0.4 + u) * dpr, padTop + u * (h - padTop - padBot) + ty * u * dpr];
  }

  const start = performance.now();
  function frame(now) {
    const t = still ? 1e9 : now - start;
    tx += (mx - tx) * 0.04; ty += (my - ty) * 0.04;
    const ink = css("--ink"), accent = css("--accent"), brass = css("--brass");
    ctx.clearRect(0, 0, w, h);
    const draw = Math.min(1, t / 3200);                       // pen-plotter reveal
    const ease = 1 - Math.pow(1 - draw, 3);

    chains.forEach((c, i) => {
      const local = Math.max(0, Math.min(1, ease * 1.6 - (i / CHAINS) * 0.6));
      const upto = local * (NODES - 1);
      if (upto <= 0) return;

      // the chain
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.5; ctx.lineWidth = c.weight * dpr;
      ctx.beginPath();
      for (let k = 0; k <= Math.floor(upto); k++) {
        const [x, y] = point(c, i, k, t);
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      const fk = Math.floor(upto), frac = upto - fk;
      if (frac > 0 && fk < NODES - 1) {
        const [x0, y0] = point(c, i, fk, t), [x1, y1] = point(c, i, fk + 1, t);
        ctx.lineTo(x0 + (x1 - x0) * frac, y0 + (y1 - y0) * frac);
      }
      ctx.stroke();

      // the nodes: each one hash
      ctx.fillStyle = ink; ctx.globalAlpha = 0.35;
      for (let k = 0; k <= fk; k++) {
        const [x, y] = point(c, i, k, t);
        ctx.beginPath(); ctx.arc(x, y, 1.1 * dpr, 0, 7); ctx.fill();
      }

      if (local < 1) return;
      ctx.globalAlpha = 1;
      // the signature reveals this node
      const [sx, sy] = point(c, i, c.sig, t);
      ctx.strokeStyle = accent; ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.arc(sx, sy, 3.6 * dpr, 0, 7); ctx.stroke();
      // the public key at the foot
      const [ex, ey] = point(c, i, NODES - 1, t);
      ctx.fillStyle = accent; ctx.fillRect(ex - 2.6 * dpr, ey - 2.6 * dpr, 5.2 * dpr, 5.2 * dpr);
      // the verifier walking from signature to key
      if (!still) {
        const cyc = ((t / 1000) * c.speed * 0.25 + c.offset) % 1.4;
        if (cyc < 1) {
          const pos = c.sig + cyc * (NODES - 1 - c.sig);
          const k = Math.floor(pos), f = pos - k;
          const [a1, b1] = point(c, i, k, t), [a2, b2] = point(c, i, Math.min(k + 1, NODES - 1), t);
          ctx.fillStyle = brass; ctx.globalAlpha = Math.sin(cyc * Math.PI) * 0.95;
          ctx.beginPath(); ctx.arc(a1 + (a2 - a1) * f, b1 + (b2 - b1) * f, 2.4 * dpr, 0, 7); ctx.fill();
        }
      }
    });
    ctx.globalAlpha = 1;
    if (!still) requestAnimationFrame(frame);
  }

  addEventListener("resize", () => { size(); if (still) frame(0); });
  if (!still) addEventListener("pointermove", e => {
    mx = (e.clientX / innerWidth - 0.5) * 14;
    my = (e.clientY / innerHeight - 0.5) * 8;
  }, { passive: true });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => still && frame(0));
  size();
  requestAnimationFrame(frame);
})();

/* copy the token contract address from the top bar */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-copy-ca]");
  if (!btn) return;
  const ca = document.getElementById("ca").textContent.trim();
  const done = () => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = "Copy"), 1600); };
  if (navigator.clipboard) navigator.clipboard.writeText(ca).then(done, () => {});
  else { const r = document.createRange(); r.selectNodeContents(document.getElementById("ca")); getSelection().removeAllRanges(); getSelection().addRange(r); }
});
