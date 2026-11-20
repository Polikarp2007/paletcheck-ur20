// Simulare celulă de paletizare UR20: transportor → preluare → 2 poziții de palet → schimb palet
// opts: {feed: găleți/min linie, robot: găleți/min celulă, speed: accelerare vizuală, theme:'hero'|'sim', labels:bool}
function CellSim(canvas, opts) {
  const o = Object.assign({ feed: 7, robot: 7.4, speed: 6, theme: 'sim', labels: true }, opts);
  const W = 600, H = 300, ctx = canvas.getContext('2d');
  const SH = { x: 360, y: 128 }, L1 = 120, L2 = 112, TOOL = 26;
  const BW = 24, BH = 26, PICK = 232, CONV_Y = 214;
  const PAL = [{ x: 410, y: 262 }, { x: 500, y: 262 }].map(p => Object.assign(p, { n: 0, st: 'ready', t: 0, off: 0 }));
  const SLOTS = 6; let done = 0, queue = [], spawnT = 0, run = true, last = performance.now(), idle = 0;
  const R = { st: 'home', t: 0, from: null, to: null, carry: false, pal: -1, pos: { x: SH.x - 40, y: 200 } };
  const tc = () => 60 / o.robot / o.speed;              // durata unui ciclu (s, timp vizual)
  const ti = () => 60 / o.feed / o.speed;               // interval sosire găleți
  const home = { x: SH.x - 30, y: 196 };
  function size() { const r = window.devicePixelRatio || 1, w = canvas.clientWidth || 600; canvas.width = w * r; canvas.height = w * H / W * r; ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0); }
  size(); window.addEventListener('resize', size);
  const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  function slotPos(pi, k) { const p = PAL[pi], c = k % 3, r = Math.floor(k / 3); return { x: p.x + 6 + c * 26 + BW / 2, y: p.y - 4 - r * (BH + 2) - BH }; }
  function freePal() { const order = R.pal === 1 ? [1, 0] : [0, 1]; for (const i of order) if (PAL[i].st === 'ready' && PAL[i].n < SLOTS) return i; return -1; }
  function step(dt) {
    // sosire găleți
    spawnT += dt; if (spawnT >= ti()) { spawnT -= ti(); if (queue.length < 9) queue.push({ x: -BW }); }
    queue.forEach((b, i) => { const tx = PICK - i * (BW + 6); b.x = Math.min(tx, b.x + 160 * dt * o.speed / 6); });
    const ready = queue.length && queue[0].x >= PICK - .5;
    // paleți: ieșire → gol → intrare
    PAL.forEach(p => { if (p.st === 'leave') { p.t += dt; p.off = ease(Math.min(1, p.t / 1.1)); if (p.t > 1.1) { p.st = 'gap'; p.t = 0; p.n = 0; done++; } }
      else if (p.st === 'gap') { p.t += dt; if (p.t > .5) { p.st = 'enter'; p.t = 0; } }
      else if (p.st === 'enter') { p.t += dt; p.off = 1 - ease(Math.min(1, p.t / .9)); if (p.t > .9) { p.st = 'ready'; p.off = 0; } } });
    // robot
    const T = tc();
    if (R.st === 'home') {
      const pi = freePal(); if (ready && pi >= 0) { R.st = 'toPick'; R.t = 0; R.from = { ...R.pos }; R.to = { x: PICK + BW / 2, y: CONV_Y - BH }; R.pal = pi; } else idle += dt;
    } else { R.t += dt; const dur = { toPick: .32, grip: .1, toPlace: .43, release: .15 }[R.st] * T, k = Math.min(1, R.t / dur);
      if (R.st === 'toPick' || R.st === 'toPlace') { const e = ease(k); R.pos.x = R.from.x + (R.to.x - R.from.x) * e; R.pos.y = R.from.y + (R.to.y - R.from.y) * e - Math.sin(Math.PI * e) * (R.st === 'toPlace' ? 70 : 40); }
      if (k >= 1) {
        if (R.st === 'toPick') { R.st = 'grip'; R.t = 0; }
        else if (R.st === 'grip') { queue.shift(); R.carry = true; R.st = 'toPlace'; R.t = 0; R.from = { ...R.pos };
          if (PAL[R.pal].st !== 'ready' || PAL[R.pal].n >= SLOTS) { const pi = freePal(); if (pi >= 0) R.pal = pi; }
          R.to = slotPos(R.pal, PAL[R.pal].n); }
        else if (R.st === 'toPlace') { R.st = 'release'; R.t = 0; }
        else if (R.st === 'release') { R.carry = false; const p = PAL[R.pal]; p.n++; if (p.n >= SLOTS) { p.st = 'leave'; p.t = 0; } R.st = 'home'; R.from = { ...R.pos }; R.pos = { ...R.pos }; R.st = 'home'; idle = 0;
          R.pos.y -= 10; }
      } }
  }
  function ik(tx, ty) { // poziția încheieturii (deasupra sculei)
    let x = tx - SH.x, y = ty - TOOL - SH.y, d = Math.hypot(x, y); const mx = L1 + L2 - 1; if (d > mx) { x *= mx / d; y *= mx / d; d = mx; }
    const a2 = Math.acos(Math.max(-1, Math.min(1, (d * d - L1 * L1 - L2 * L2) / (2 * L1 * L2))));
    const a1 = Math.atan2(y, x) - Math.atan2(L2 * Math.sin(-a2), L1 + L2 * Math.cos(-a2));
    const e = { x: SH.x + L1 * Math.cos(a1), y: SH.y + L1 * Math.sin(a1) }; return { e, w: { x: e.x + L2 * Math.cos(a1 - a2), y: e.y + L2 * Math.sin(a1 - a2) } };
  }
  function bucket(x, y, warn) { ctx.fillStyle = warn ? '#ffb27a' : '#ffffff'; rr(x, y + 3, BW, BH - 3, 4); ctx.fill(); ctx.fillStyle = warn ? '#ff8f4d' : '#d9deff'; rr(x - 1, y, BW + 2, 6, 2); ctx.fill();
    ctx.strokeStyle = '#8f96c8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + BW / 2, y + 2, 8, Math.PI, 0); ctx.stroke(); }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
  function link(a, b, w) { ctx.strokeStyle = '#e9edf5'; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = w * .35; ctx.beginPath(); ctx.moveTo(a.x, a.y + w * .2); ctx.lineTo(b.x, b.y + w * .2); ctx.stroke(); }
  function joint(p, r) { ctx.fillStyle = '#8fc5ff'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill(); ctx.fillStyle = '#5f9fe8'; ctx.beginPath(); ctx.arc(p.x, p.y, r * .4, 0, 7); ctx.fill(); }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    // podea + zonă de siguranță
    ctx.fillStyle = 'rgba(255,255,255,.05)'; rr(300, 270, 290, 22, 6); ctx.fill();
    ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,211,77,.55)'; ctx.lineWidth = 2; ctx.strokeRect(300, 70, 290, 222); ctx.setLineDash([]);
    // transportor
    ctx.fillStyle = '#3a3fd0'; rr(0, CONV_Y, PICK + BW + 14, 10, 5); ctx.fill(); ctx.fillStyle = '#1a1e8c'; ctx.fillRect(0, CONV_Y + 10, PICK + BW + 14, 24);
    for (let i = 0; i < 8; i++) { ctx.fillStyle = '#2b2fa8'; ctx.beginPath(); ctx.arc(18 + i * 32, CONV_Y + 22, 5, 0, 7); ctx.fill(); }
    // cameră vision
    ctx.fillStyle = '#8f96c8'; ctx.fillRect(PICK + BW / 2 - 2, 108, 4, 60); ctx.fillStyle = '#dfe4ff'; rr(PICK - 4, 98, 32, 14, 3); ctx.fill();
    ctx.fillStyle = 'rgba(143,197,255,.14)'; ctx.beginPath(); ctx.moveTo(PICK + BW / 2, 112); ctx.lineTo(PICK - 10, CONV_Y); ctx.lineTo(PICK + BW + 10, CONV_Y); ctx.fill();
    const jam = queue.length >= 4;
    queue.forEach((b, i) => { if (!(i === 0 && R.st === 'grip' && R.t > 0)) bucket(b.x, CONV_Y - BH, jam && i > 0); });
    // paleți
    PAL.forEach((p, i) => { const dx = p.off * 0, dy = p.off * 90, al = 1 - p.off * .9; if (p.st === 'gap') return; ctx.globalAlpha = al;
      ctx.fillStyle = '#c49a62'; ctx.fillRect(p.x + dx, p.y + dy, 84, 8); ctx.fillStyle = '#a87f4d'; [0, 37, 74].forEach(o2 => ctx.fillRect(p.x + o2 + dx, p.y + 8 + dy, 10, 7));
      for (let k = 0; k < p.n; k++) { const s = slotPos(i, k); bucket(s.x - BW / 2 + dx, s.y + dy); }
      if (p.n >= 3) { ctx.fillStyle = '#d8c7a8'; ctx.fillRect(p.x + dx, p.y - 4 - BH - 3 + dy, 84, 3); }
      ctx.globalAlpha = 1; });
    // piedestal + scanere
    ctx.fillStyle = '#1a1e8c'; rr(SH.x - 26, SH.y + 22, 52, 270 - SH.y - 22, 6); ctx.fill(); ctx.fillStyle = '#3a3fd0'; rr(SH.x - 32, SH.y + 14, 64, 12, 4); ctx.fill();
    ctx.fillStyle = '#ffd34d'; rr(304, 276, 14, 10, 2); ctx.fill(); rr(572, 276, 14, 10, 2); ctx.fill();
    // braț
    const { e, w } = ik(R.pos.x, R.pos.y);
    ctx.fillStyle = '#e9edf5'; rr(SH.x - 16, SH.y - 4, 32, 30, 8); ctx.fill();
    link(SH, e, 20); joint(SH, 13); link(e, w, 16); joint(e, 11);
    ctx.fillStyle = '#c7cede'; rr(w.x - 6, w.y, 12, TOOL - 6, 3); ctx.fill(); joint(w, 8);
    ctx.fillStyle = '#e3123c'; rr(w.x - 15, w.y + TOOL - 8, 30, 7, 2); ctx.fill();
    if (R.carry || (R.st === 'grip' && R.t > 0)) bucket(w.x - BW / 2, w.y + TOOL - 1);
    // etichete
    if (o.labels) { ctx.font = '700 13px "Inter Tight",sans-serif'; ctx.fillStyle = '#aeb3ff'; ctx.fillText('Linie ' + o.feed.toLocaleString('ro-RO', { maximumFractionDigits: 1 }) + ' găleți/min', 6, 290);
      ctx.fillStyle = '#fff'; ctx.fillText('UR20 ' + o.robot.toLocaleString('ro-RO', { maximumFractionDigits: 1 }) + '/min', 318, 92);
      ctx.fillStyle = '#c9ccff'; ctx.textAlign = 'right'; ctx.fillText('Paleți finalizați: ' + done, 594, 60); ctx.textAlign = 'left';
      let msg, col; if (jam) { msg = '▲ Coadă pe transportor: celula este blocajul'; col = '#ffb27a'; } else if (idle > .35 * tc()) { msg = '● UR20 așteaptă găleata: blocajul este linia de umplere'; col = '#6ff0b8'; } else { msg = '● Flux echilibrat'; col = '#6ff0b8'; }
      if (PAL.some(p => p.st !== 'ready')) msg += ' · operatorul schimbă paletul';
      ctx.fillStyle = col; ctx.fillText(msg, 6, 24); }
  }
  function loop(now) { if (!run) return; const dt = Math.min(.05, (now - last) / 1000); last = now; step(dt); draw(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  return { stop() { run = false; } };
}
