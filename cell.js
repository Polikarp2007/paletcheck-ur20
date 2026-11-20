// Simulare celulă de paletizare UR20 (vedere laterală): transportor → UR20 la capătul benzii → 2 poziții de palet → schimb palet.
// Mișcarea între poziții se face în spațiul articulațiilor (ca rotirea bazei unui UR20), fără salturi.
// opts: {feed: găleți/min linie, robot: găleți/min celulă, speed: accelerare vizuală}
function CellSim(canvas, opts) {
  const o = Object.assign({ feed: 7, robot: 7.4, speed: 5 }, opts);
  const W = 600, H = 300, ctx = canvas.getContext('2d');
  const FLOOR = 236, BW = 24, BH = 26, TOOL = 22;
  const SH = { x: 300, y: 128 }, L1 = 150, L2 = 118;
  const CONV_Y = 168, CX = 352, PICK = 396;
  const PAL = [{ x: 30 }, { x: 140 }].map(p => Object.assign(p, { y: FLOOR - 16, n: 0, c: [], st: 'ready', t: 0, off: 0 }));
  const COLS = ['#ffffff', '#f2e4c6', '#a8774f', '#e6e9f2', '#d8b386', '#7a5236']; let ci = 0; const SLOTS = 6; let queue = [], spawnT = 0, run = true, last = performance.now(), belt = 0;
  const tc = () => 60 / o.robot / o.speed, ti = () => 60 / o.feed / o.speed;
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  function size() { const r = window.devicePixelRatio || 1, w = canvas.clientWidth || 600; canvas.width = w * r; canvas.height = w * H / W * r; ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0); }
  size(); window.addEventListener('resize', size);
  function ik(tx, ty) {
    let x = tx - SH.x, y = ty - TOOL - SH.y, d = Math.hypot(x, y); const mx = L1 + L2 - 1, mn = Math.abs(L1 - L2) + 1;
    if (d > mx) { x *= mx / d; y *= mx / d; d = mx; } if (d < mn) { x *= mn / d; y *= mn / d; d = mn; }
    const c2 = Math.acos(Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2))));
    const sols = [1, -1].map(sg => { const a = Math.atan2(y, x) - Math.atan2(L2 * Math.sin(sg * c2), L1 + L2 * Math.cos(sg * c2)); return { a, b: a + sg * c2, ey: Math.sin(a) }; });
    return sols[0].ey <= sols[1].ey ? sols[0] : sols[1];
  }
  const fk = p => { const e = { x: SH.x + L1 * Math.cos(p.a), y: SH.y + L1 * Math.sin(p.a) }; return { e, w: { x: e.x + L2 * Math.cos(p.b), y: e.y + L2 * Math.sin(p.b) } }; };
  const wrap = d => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const lerpP = (p, q, k) => ({ a: p.a + wrap(q.a - p.a) * k, b: p.b + wrap(q.b - p.b) * k });
  const pickP = { x: PICK + BW / 2, y: CONV_Y - BH }, home = ik(pickP.x, pickP.y - 46), atPick = ik(pickP.x, pickP.y);
  function slot(pi, k) { const p = PAL[pi], c = 2 - k % 3, r = Math.floor(k / 3); return { x: p.x + 6 + c * 26 + BW / 2, y: p.y - r * (BH + 3) - BH }; }
  const R = { st: 'home', t: 0, pose: { ...home }, from: null, to: null, carry: false, pal: 1, col: '#fff' };
  function freePal() { for (const i of [R.pal, 1 - R.pal]) if (PAL[i].st === 'ready' && PAL[i].n < SLOTS) return i; return -1; }
  function go(st, to) { R.st = st; R.t = 0; R.from = { ...R.pose }; R.to = to; }
  function step(dt) {
    spawnT += dt; if (spawnT >= ti()) { spawnT -= ti(); if (queue.length < 8) queue.push({ x: W + 6, c: COLS[ci++ % COLS.length] }); }
    belt = (belt + 60 * dt * o.speed / 5) % 30;
    queue.forEach((b, i) => { const tx = PICK + i * (BW + 6); b.x = Math.max(tx, b.x - 150 * dt * o.speed / 5); });
    const ready = queue.length && queue[0].x <= PICK + .5;
    PAL.forEach(p => {
      if (p.st === 'leave') { p.t += dt; p.off = ease(Math.min(1, p.t / 1)); if (p.t > 1) { p.st = 'gap'; p.t = 0; p.n = 0; p.c = []; } }
      else if (p.st === 'gap') { p.t += dt; if (p.t > .4) { p.st = 'enter'; p.t = 0; } }
      else if (p.st === 'enter') { p.t += dt; p.off = 1 - ease(Math.min(1, p.t / .8)); if (p.t > .8) { p.st = 'ready'; p.off = 0; } } });
    const T = tc(), D = { down: .1, grip: .08, toPal: .36, place: .08, release: .06, up: .06, back: .26 };
    if (R.st === 'home') { const pi = freePal(); if (ready && pi >= 0) { R.pal = pi; go('down', atPick); } return; }
    R.t += dt; const k = Math.min(1, R.t / (D[R.st] * T)); R.pose = lerpP(R.from, R.to, ease(k));
    if (k < 1) return;
    const s = R.st;
    if (s === 'down') go('grip', atPick);
    else if (s === 'grip') { R.col = queue.shift().c; R.carry = true; if (PAL[R.pal].st !== 'ready' || PAL[R.pal].n >= SLOTS) { const pi = freePal(); if (pi >= 0) R.pal = pi; }
      const sp = slot(R.pal, PAL[R.pal].n); R.target = sp; go('toPal', ik(sp.x, sp.y - 34)); }
    else if (s === 'toPal') go('place', ik(R.target.x, R.target.y));
    else if (s === 'place') go('release', R.pose);
    else if (s === 'release') { R.carry = false; const p = PAL[R.pal]; p.c.push(R.col); p.n++; if (p.n >= SLOTS) { p.st = 'leave'; p.t = 0; } go('up', ik(R.target.x, R.target.y - 34)); }
    else if (s === 'up') go('back', home);
    else if (s === 'back') { R.st = 'home'; R.pose = { ...home }; }
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function bucket(x, y, col) { col = col || '#ffffff';
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x + 2, y + BH, BW - 4, 2);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x + BW, y + 4); ctx.lineTo(x + BW - 2, y + BH); ctx.lineTo(x + 2, y + BH); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(10,14,107,.10)'; ctx.fillRect(x + BW / 2, y + 4, BW / 2 - 1, BH - 4);
    ctx.fillStyle = '#eef0f8'; rr(x - 1, y + 1, BW + 2, 5, 2); ctx.fill();
    ctx.strokeStyle = '#9aa1d6'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x + BW / 2, y + 3, 7, Math.PI, 0); ctx.stroke();
  }
  function link(a, b, w) {
    ctx.lineCap = 'round'; ctx.strokeStyle = '#eef1f8'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,50,110,.12)'; ctx.lineWidth = w * .3; ctx.beginPath(); ctx.moveTo(a.x, a.y + w * .22); ctx.lineTo(b.x, b.y + w * .22); ctx.stroke();
  }
  function joint(p, r) { ctx.fillStyle = '#8fc5ff'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.fillStyle = '#5e9de6'; ctx.beginPath(); ctx.arc(p.x, p.y, r * .42, 0, 7); ctx.fill(); }
  function draw() {
    ctx.clearRect(0, 0, W, H); ctx.save(); ctx.translate(0, 40);
    ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fillRect(0, FLOOR, W, 2);
    const CL = W - CX;
    ctx.fillStyle = '#12166e'; [CX + 14, W - 24].forEach(x => ctx.fillRect(x, CONV_Y + 26, 10, FLOOR - CONV_Y - 26));
    ctx.fillStyle = '#1a1e8c'; ctx.fillRect(CX, CONV_Y + 8, CL, 20);
    ctx.fillStyle = '#4a50e8'; rr(CX, CONV_Y, CL + 10, 9, 4.5); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(CX, CONV_Y, CL, 9); ctx.clip(); ctx.fillStyle = 'rgba(255,255,255,.13)'; for (let x = CX - belt; x < W + 30; x += 30) ctx.fillRect(x, CONV_Y, 13, 9); ctx.restore();
    for (let x = CX + 14; x < W; x += 28) { ctx.fillStyle = '#2b2fa8'; ctx.beginPath(); ctx.arc(x, CONV_Y + 18, 3.5, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#7e86c2'; ctx.fillRect(PICK + 52, 70, 4, CONV_Y - 70); ctx.fillRect(PICK + 22, 70, 34, 4);
    ctx.fillStyle = '#dfe4ff'; rr(PICK, 66, 26, 12, 3); ctx.fill();
    ctx.fillStyle = 'rgba(143,197,255,.13)'; ctx.beginPath(); ctx.moveTo(PICK + 13, 78); ctx.lineTo(PICK - 6, CONV_Y); ctx.lineTo(PICK + BW + 6, CONV_Y); ctx.fill();
    queue.forEach(b => bucket(b.x, CONV_Y - BH, b.c));
    ctx.save(); ctx.beginPath(); ctx.rect(0, -60, W, FLOOR + 61); ctx.clip();
    PAL.forEach((p, i) => { if (p.st === 'gap') return; const dy = p.off * 110;
      ctx.fillStyle = '#d2a970'; ctx.fillRect(p.x, p.y + dy, 84, 4); ctx.fillStyle = '#b88a52'; ctx.fillRect(p.x, p.y + 4 + dy, 84, 4);
      ctx.fillStyle = '#9a6f3f'; [0, 37, 74].forEach(x => ctx.fillRect(p.x + x, p.y + 8 + dy, 10, 8));
      for (let k = 0; k < p.n; k++) { const s = slot(i, k); bucket(s.x - BW / 2, s.y + dy, p.c[k]); if (k === 2) { ctx.fillStyle = '#e2d3b5'; ctx.fillRect(p.x + 2, s.y - 3 + dy, 80, 3); } }
      });
    ctx.restore();
    ctx.fillStyle = '#ffd34d'; rr(240, FLOOR - 8, 12, 8, 2); ctx.fill(); rr(14, FLOOR - 8, 12, 8, 2); ctx.fill();
    const pg = ctx.createLinearGradient(SH.x - 22, 0, SH.x + 22, 0); pg.addColorStop(0, '#23279e'); pg.addColorStop(.5, '#3d42d6'); pg.addColorStop(1, '#171b80');
    ctx.fillStyle = pg; rr(SH.x - 20, SH.y + 22, 40, FLOOR - SH.y - 22, 5); ctx.fill();
    ctx.fillStyle = '#12166e'; rr(SH.x - 32, FLOOR - 8, 64, 8, 3); ctx.fill(); ctx.fillStyle = '#3a3fd0'; rr(SH.x - 26, SH.y + 16, 52, 9, 3); ctx.fill();
    const { e, w } = fk(R.pose);
    ctx.fillStyle = '#e3e7f2'; rr(SH.x - 15, SH.y - 6, 30, 28, 8); ctx.fill();
    link(SH, e, 19); joint(SH, 13); link(e, w, 15); joint(e, 11);
    ctx.fillStyle = '#c3cadc'; rr(w.x - 6, w.y, 12, TOOL - 5, 3); ctx.fill(); joint(w, 7.5);
    ctx.fillStyle = '#e3123c'; rr(w.x - 15, w.y + TOOL - 7, 30, 6, 2); ctx.fill();
    if (R.carry) bucket(w.x - BW / 2, w.y + TOOL - 1, R.col);
    ctx.restore();
  }
  if (o.warm) for (let i = 0; i < o.warm * 60; i++) step(1 / 60);
  function loop(now) { if (!run) return; const dt = Math.min(.05, (now - last) / 1000); last = now; step(dt); draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  return { stop() { run = false; } };
}
