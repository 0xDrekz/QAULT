/* ---------- the background: points in superposition ----------
   Every point flickers between two possible positions and is drawn at
   both, faintly, joined to its neighbours. Purely decoration. */
(() => {
  const c = document.querySelector("#field"), x = c.getContext("2d");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w, h, pts;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = c.width = innerWidth * dpr; h = c.height = innerHeight * dpr;
    const n = Math.round(Math.min(90, (innerWidth * innerHeight) / 16000));
    pts = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      dx: (Math.random() - 0.5) * 60 * dpr, dy: (Math.random() - 0.5) * 60 * dpr,
      vx: (Math.random() - 0.5) * 0.15 * dpr, vy: (Math.random() - 0.5) * 0.15 * dpr,
      ph: Math.random() * Math.PI * 2, sp: 0.004 + Math.random() * 0.01
    }));
  }
  function frame() {
    x.clearRect(0, 0, w, h);
    const link = Math.min(w, h) * 0.16;
    for (const p of pts) {
      p.x = (p.x + p.vx + w) % w; p.y = (p.y + p.vy + h) % h; p.ph += p.sp;
      p.a = (Math.sin(p.ph) + 1) / 2;                           // weight on state A vs B
      p.px = p.x + p.dx * (1 - p.a); p.py = p.y + p.dy * (1 - p.a);
    }
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j], d = Math.hypot(a.px - b.px, a.py - b.py);
      if (d < link) {
        x.strokeStyle = `rgba(169,139,255,${0.12 * (1 - d / link)})`;
        x.beginPath(); x.moveTo(a.px, a.py); x.lineTo(b.px, b.py); x.stroke();
      }
    }
    for (const p of pts) {
      x.fillStyle = `rgba(124,243,255,${0.25 + 0.5 * p.a})`;
      x.beginPath(); x.arc(p.x, p.y, 1.6, 0, 7); x.fill();
      x.fillStyle = `rgba(169,139,255,${0.25 + 0.5 * (1 - p.a)})`;
      x.beginPath(); x.arc(p.x + p.dx, p.y + p.dy, 1.6, 0, 7); x.fill();
    }
    if (!still) requestAnimationFrame(frame);
  }
  addEventListener("resize", () => { size(); if (still) frame(); });
  size(); frame();
})();
