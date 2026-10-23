(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Loader ---------- */
const loader = $('#loader'), loaderText = $('#loaderText');
let pct = 0;
const lt = setInterval(() => {
  pct = Math.min(100, pct + Math.ceil(Math.random() * 9));
  loaderText.textContent = `Initialising neural core… ${pct}%`;
  if (pct >= 100) { clearInterval(lt); setTimeout(() => { loader.classList.add('done'); start(); }, 350); }
}, 60);

let started = false;
function start() {
  if (started) return; started = true;
  $$('#home .reveal').forEach((el, i) => setTimeout(() => el.classList.add('in'), 150 * i));
}

/* ---------- Cursor glow, progress, nav ---------- */
const glow = $('#cursorGlow');
let mx = innerWidth / 2, my = innerHeight / 2;
addEventListener('pointermove', e => { mx = e.clientX; my = e.clientY; glow.style.left = mx + 'px'; glow.style.top = my + 'px'; });
const bar = $('#progress'), nav = $('#nav');
addEventListener('scroll', () => {
  const h = document.documentElement;
  bar.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight) * 100) + '%';
  nav.classList.toggle('scrolled', h.scrollTop > 40);
}, { passive: true });
$('#burger').onclick = () => $('#links').classList.toggle('open');
$$('#links a').forEach(a => a.addEventListener('click', () => $('#links').classList.remove('open')));

/* ---------- Typed rotating word ---------- */
const words = ['intelligence.', 'innovation.', 'automation.', 'foresight.'];
const typed = $('#typed');
let wi = 0, ci = words[0].length, del = false;
setTimeout(function tick() {
  if (del) {
    ci--;
    if (ci <= 0) { del = false; wi = (wi + 1) % words.length; }
  } else {
    ci++;
    if (ci >= words[wi].length) { ci = words[wi].length; del = true; typed.textContent = words[wi]; return setTimeout(tick, 1800); }
  }
  typed.textContent = words[wi].slice(0, ci) || '​';
  setTimeout(tick, del ? 40 : 80);
}, 2500);

/* ---------- Reveal + counters + timeline ---------- */
const countUp = el => {
  const to = +el.dataset.count, suf = el.dataset.suffix || '', t0 = performance.now(), d = 2000;
  const f = t => { const p = Math.min((t - t0) / d, 1), e = 1 - Math.pow(1 - p, 4);
    el.textContent = Math.round(to * e).toLocaleString() + suf; if (p < 1) requestAnimationFrame(f); };
  requestAnimationFrame(f);
};
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  const el = e.target;
  if (!el.closest('#home')) el.classList.add('in');
  $$('[data-count]', el).forEach(countUp);
  if (el.classList.contains('timeline')) $('#tFill').style.cssText = matchMedia('(max-width:980px)').matches ? 'height:100%' : 'width:100%';
  io.unobserve(el);
}), { threshold: .15 });
$$('.reveal').forEach((el, i) => { el.style.transitionDelay = (el.parentElement.classList.contains('cards') || el.parentElement.classList.contains('pillars')) ? ($$('.reveal', el.parentElement).indexOf(el) * 120) + 'ms' : ''; io.observe(el); });

/* ---------- Card tilt + spotlight ---------- */
$$('.tilt').forEach(c => {
  c.addEventListener('pointermove', e => {
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.setProperty('--mx', x * 100 + '%'); c.style.setProperty('--my', y * 100 + '%');
    if (!reduce) c.style.transform = `perspective(900px) rotateX(${(.5 - y) * 10}deg) rotateY(${(x - .5) * 12}deg) translateY(-4px)`;
  });
  c.addEventListener('pointerleave', () => c.style.transform = '');
});

/* ---------- Hero neural network ---------- */
(function neural() {
  const cv = $('#neural'), ctx = cv.getContext('2d');
  let W, H, pts = [];
  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.width = cv.offsetWidth * dpr; H = cv.height = cv.offsetHeight * dpr; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
    W /= dpr; H /= dpr;
    const n = Math.min(120, Math.floor(W * H / 14000));
    pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35 }));
  };
  resize(); addEventListener('resize', resize);
  const pulses = [];
  setInterval(() => { if (pts.length > 1) pulses.push({ a: pts[Math.random() * pts.length | 0], t: 0 }); }, 500);
  let visible = true;
  new IntersectionObserver(e => visible = e[0].isIntersecting).observe(cv);
  (function draw() {
    requestAnimationFrame(draw);
    if (!visible) return;
    ctx.clearRect(0, 0, W, H);
    const r = cv.getBoundingClientRect(), px = mx - r.left, py = my - r.top;
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1;
      const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy);
      if (d < 140) { p.x += dx / d * 1.2; p.y += dy / d * 1.2; }
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 130) { ctx.strokeStyle = `rgba(91,61,245,${(1 - d / 130) * .3})`; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      const dm = Math.hypot(a.x - px, a.y - py);
      if (dm < 180) { ctx.strokeStyle = `rgba(224,53,159,${(1 - dm / 180) * .55})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(px, py); ctx.stroke(); }
      ctx.fillStyle = '#6b7fe0'; ctx.beginPath(); ctx.arc(a.x, a.y, 2, 0, 7); ctx.fill();
    }
    // signal pulses travelling to nearest neighbour
    for (let i = pulses.length - 1; i >= 0; i--) {
      const s = pulses[i]; s.t += .02;
      if (!s.b) { let best = 1e9; for (const q of pts) { const d = Math.hypot(q.x - s.a.x, q.y - s.a.y); if (q !== s.a && d < best && d < 200) { best = d; s.b = q; } } if (!s.b) { pulses.splice(i, 1); continue; } }
      const x = s.a.x + (s.b.x - s.a.x) * s.t, y = s.a.y + (s.b.y - s.a.y) * s.t;
      ctx.fillStyle = '#0891d8'; ctx.shadowColor = '#0891d8'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      if (s.t >= 1) pulses.splice(i, 1);
    }
  })();
})();

/* ---------- Business tabs ---------- */
const DIV = [
  { t: 'Construction & Dredging', p: 'From marine works to landmark towers and interiors — the group that has physically shaped Dubai for decades.', ai: 'Digital-twin scheduling and computer-vision site safety flag hazards in seconds.', b: ['DutCon', 'DBB Contracting', 'BK Gulf', 'BK Gulf FM', 'Dutco Interiors', 'Gulf Cobla'], v: 'grid', l: 'LIVE SITE TWIN · 3D MESH' },
  { t: 'Hospitality & Tourism', p: 'JA resorts and hotels across the Indian Ocean and UAE, plus travel services that connect guests to the world.', ai: 'Guest-intelligence models personalise every stay and optimise rates in real time.', b: ['JA Resorts', 'The Manor Hotel by JA', 'Dutco Travels & Tourism'], v: 'waves', l: 'GUEST DEMAND · FORECAST' },
  { t: 'Oil & Gas', p: 'Energy services, fuels and clean-tech solutions supporting the region\'s transition.', ai: 'Anomaly detection across pipelines and plant lowers emissions and unplanned outages.', b: ['Dutco Energy', 'International Octane', 'Tarka Resources', 'Dutco Cleantech'], v: 'flow', l: 'PLANT TELEMETRY · STREAM' },
  { t: 'Trading, Manufacturing & Logistics', p: 'Industrial equipment, communications, freight and fabrication — the backbone of regional supply chains.', ai: 'Demand-sensing and route optimisation cut lead times and carbon per shipment.', b: ['Dutco Tennant', 'Business Communications', 'Modern Freight', 'Lionweld Meiser'], v: 'routes', l: 'FLEET ROUTING · OPTIMISED' },
  { t: 'Real Estate', p: 'Developing and managing properties that carry the Dutco standard into the next generation of cities.', ai: 'Valuation and occupancy models guide portfolio decisions with confidence.', b: ['Development', 'Asset Management', 'Leasing'], v: 'bars', l: 'PORTFOLIO · VALUE INDEX' }
];
const vc = $('#vizCanvas'), vx = vc.getContext('2d');
let viz = 'grid', vt = 0;
const fitViz = () => { vc.width = vc.offsetWidth; vc.height = vc.offsetHeight; };
fitViz(); addEventListener('resize', fitViz);
const VIZ = {
  grid(w, h, t) { const cx = w / 2, cy = h / 2; vx.strokeStyle = 'rgba(8,145,216,.6)'; vx.lineWidth = 1;
    for (let i = -8; i <= 8; i++) { for (let j = -8; j <= 8; j++) {
      const z = Math.sin(i * .5 + t) * Math.cos(j * .5 + t) * 20, x = cx + (i - j) * 24, y = cy + (i + j) * 12 - z;
      vx.fillStyle = `hsl(${220 + z * 3},80%,${48 + z}%)`; vx.fillRect(x - 1.5, y - 1.5, 3, 3);
      if (i < 8) { const z2 = Math.sin((i + 1) * .5 + t) * Math.cos(j * .5 + t) * 20; vx.globalAlpha = .25; vx.beginPath(); vx.moveTo(x, y); vx.lineTo(cx + (i + 1 - j) * 24, cy + (i + 1 + j) * 12 - z2); vx.stroke(); vx.globalAlpha = 1; } } } },
  waves(w, h, t) { for (let k = 0; k < 5; k++) { vx.beginPath(); vx.strokeStyle = `hsla(${200 + k * 35},80%,52%,${.85 - k * .12})`; vx.lineWidth = 2;
    for (let x = 0; x <= w; x += 4) { const y = h / 2 + Math.sin(x * .02 + t * 1.5 + k) * (30 + k * 8) + Math.sin(x * .05 - t + k) * 10; x ? vx.lineTo(x, y) : vx.moveTo(x, y); } vx.stroke(); } },
  flow(w, h, t) { for (let i = 0; i < 40; i++) { const y = (i / 40) * h, off = (t * 80 + i * 37) % (w + 60) - 30;
    vx.fillStyle = `hsla(${190 + i * 4},85%,45%,.85)`; vx.fillRect(off, y, 40, 2); vx.fillStyle = 'rgba(11,18,32,.07)'; vx.fillRect(0, y + 1, w, 1); } },
  routes(w, h, t) { const nodes = [[.15, .3], [.4, .65], [.6, .25], [.85, .6], [.5, .5], [.25, .8]];
    nodes.forEach(([a, b], i) => { nodes.forEach(([c, d], j) => { if (j <= i) return; vx.strokeStyle = 'rgba(91,61,245,.3)'; vx.beginPath(); vx.moveTo(a * w, b * h); vx.lineTo(c * w, d * h); vx.stroke();
      const p = (t * .3 + i * .17 + j * .11) % 1; vx.fillStyle = '#0891d8'; vx.beginPath(); vx.arc(a * w + (c - a) * w * p, b * h + (d - b) * h * p, 3, 0, 7); vx.fill(); }); vx.fillStyle = '#ff4fd8'; vx.beginPath(); vx.arc(a * w, b * h, 6, 0, 7); vx.fill(); }); },
  bars(w, h, t) { const n = 16; for (let i = 0; i < n; i++) { const bh = (Math.sin(t + i * .5) * .5 + .5) * h * .6 + 20, x = 30 + i * ((w - 60) / n);
    const g = vx.createLinearGradient(0, h - bh, 0, h); g.addColorStop(0, '#5b3df5'); g.addColorStop(1, '#0891d8'); vx.fillStyle = g; vx.fillRect(x, h - bh - 30, (w - 60) / n - 8, bh); } }
};
(function loop() { requestAnimationFrame(loop); vt += .02; vx.clearRect(0, 0, vc.width, vc.height); VIZ[viz](vc.width, vc.height, vt); })();
function setTab(i) {
  const d = DIV[i]; viz = d.v;
  $$('#tabs button').forEach((b, k) => b.classList.toggle('active', k === i));
  const p = $('#panel'); p.classList.remove('swap'); void p.offsetWidth; p.classList.add('swap');
  $('#pTitle').textContent = d.t; $('#pText').textContent = d.p; $('#pAi').textContent = d.ai; $('#vizLabel').textContent = d.l;
  $('#pBrands').innerHTML = d.b.map((x, k) => `<span style="animation-delay:${k * 70}ms">${x}</span>`).join('');
}
$$('#tabs button').forEach(b => b.onclick = () => { setTab(+b.dataset.tab); auto = false; });
let auto = true, ti = 0;
setTab(0);
setInterval(() => { if (auto) setTab(ti = (ti + 1) % DIV.length); }, 6000);

/* ---------- AI assistant demo ---------- */
const ANS = {
  'What does Dutco do?': 'Dutco Group began in 1947 as the Dubai Transport Company and today spans five divisions: Construction & Dredging, Hospitality & Tourism, Oil & Gas, Trading/Manufacturing/Logistics, and Real Estate.',
  'How do you use AI in construction?': 'Digital twins simulate schedule, cost and safety before work begins, while computer vision on site flags hazards in real time. Predictive maintenance keeps heavy equipment running.',
  'Where are you located?': 'Headquartered in Dubai, with presence in Abu Dhabi, KSA, Qatar, Seychelles, Maldives, London, Toronto and US cities including Houston, Chicago and San Francisco.',
  'Tell me about sustainability': 'We hold ISO-certified quality, health, safety and environmental standards. AI helps measure and reduce emissions across plant, fleet and buildings.'
};
const chat = $('#chat');
const add = (cls, html) => { const m = document.createElement('div'); m.className = 'msg ' + cls; m.innerHTML = html; chat.appendChild(m); chat.scrollTop = chat.scrollHeight; return m; };
add('b', 'Hello! I\'m the Dutco AI guide. Pick a question below 👇');
let busy = false;
$$('#prompts button').forEach(b => b.onclick = () => {
  if (busy) return; busy = true;
  add('u', b.textContent);
  const t = add('b typing', '<i></i><i></i><i></i>');
  setTimeout(() => { t.classList.remove('typing'); t.textContent = ''; const txt = ANS[b.textContent]; let i = 0;
    const iv = setInterval(() => { t.textContent = txt.slice(0, ++i); chat.scrollTop = chat.scrollHeight; if (i >= txt.length) { clearInterval(iv); busy = false; } }, 14); }, 900);
});

/* ---------- Globe ---------- */
const CITIES = [['Dubai (HQ)', 25.2, 55.27, 1], ['Abu Dhabi', 24.45, 54.38], ['Riyadh, KSA', 24.7, 46.7], ['Doha, Qatar', 25.29, 51.53], ['Seychelles', -4.68, 55.49], ['Maldives', 3.2, 73.2], ['London', 51.5, -0.12], ['Toronto', 43.65, -79.38], ['Houston', 29.76, -95.37], ['Chicago', 41.88, -87.63], ['San Francisco', 37.77, -122.42]];
const ul = $('#cities');
CITIES.forEach((c, i) => { const li = document.createElement('li'); li.textContent = c[0]; if (c[3]) li.className = 'hq'; li.onmouseenter = () => { focus = i; }; li.onmouseleave = () => { focus = -1; }; ul.appendChild(li); });
let focus = -1;
(function globe() {
  const cv = $('#globe'), ctx = cv.getContext('2d');
  let rot = -55 * Math.PI / 180, tilt = .45, drag = false, lx = 0, vis = false, target = null;
  const fit = () => { const dpr = Math.min(devicePixelRatio || 1, 2); cv.width = cv.offsetWidth * dpr; cv.height = cv.offsetHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  fit(); addEventListener('resize', fit);
  new IntersectionObserver(e => vis = e[0].isIntersecting).observe(cv);
  cv.onpointerdown = e => { drag = true; lx = e.clientX; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; };
  cv.onpointerup = () => { drag = false; cv.style.cursor = 'grab'; };
  cv.onpointermove = e => { if (drag) { rot += (e.clientX - lx) * .008; lx = e.clientX; } };
  // dotted sphere points
  const dots = []; for (let la = -80; la <= 80; la += 5) { const n = Math.max(6, Math.round(72 * Math.cos(la * Math.PI / 180))); for (let k = 0; k < n; k++) dots.push([la, k / n * 360 - 180]); }
  const proj = (la, lo, R, cx, cy) => { const phi = la * Math.PI / 180, lam = lo * Math.PI / 180 + rot;
    const x = Math.cos(phi) * Math.sin(lam), y = Math.sin(phi), z = Math.cos(phi) * Math.cos(lam);
    const y2 = y * Math.cos(tilt) - z * Math.sin(tilt), z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
    return [cx + x * R, cy - y2 * R, z2]; };
  let t = 0;
  (function draw() {
    requestAnimationFrame(draw); if (!vis) return; t += .02;
    const w = cv.offsetWidth, h = cv.offsetHeight, R = Math.min(w, h) * .42, cx = w / 2, cy = h / 2;
    if (!drag) { if (focus >= 0) { let d = (-CITIES[focus][2] * Math.PI / 180) - rot; d = Math.atan2(Math.sin(d), Math.cos(d)); rot += d * .06; } else rot += .003; }
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(cx, cy, R * .6, cx, cy, R * 1.35); g.addColorStop(0, 'rgba(91,61,245,.14)'); g.addColorStop(1, 'transparent'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = 'rgba(91,61,245,.3)'; ctx.stroke();
    for (const [la, lo] of dots) { const [x, y, z] = proj(la, lo, R, cx, cy); if (z > 0) { ctx.fillStyle = `rgba(70,90,200,${.15 + z * .5})`; ctx.fillRect(x, y, 1.6, 1.6); } }
    const P = CITIES.map(c => proj(c[1], c[2], R, cx, cy));
    const hq = P[0];
    CITIES.forEach((c, i) => { if (!i) return; const a = P[i]; if (a[2] < 0 || hq[2] < 0) return;
      const mx2 = (a[0] + hq[0]) / 2, my2 = (a[1] + hq[1]) / 2 - 40 - Math.hypot(a[0] - hq[0], a[1] - hq[1]) * .25;
      ctx.strokeStyle = 'rgba(8,145,216,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hq[0], hq[1]); ctx.quadraticCurveTo(mx2, my2, a[0], a[1]); ctx.stroke();
      const p = (t * .4 + i * .13) % 1, q = 1 - p, x = q * q * hq[0] + 2 * q * p * mx2 + p * p * a[0], y = q * q * hq[1] + 2 * q * p * my2 + p * p * a[1];
      ctx.fillStyle = '#0891d8'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill(); });
    CITIES.forEach((c, i) => { const [x, y, z] = P[i]; if (z < 0) return; const on = i === focus, col = c[3] ? '#e0359f' : '#0891d8';
      const r = 3.5 + (on ? 3 : 0) + Math.sin(t * 3 + i) * .8; ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = col; ctx.globalAlpha = 1 - (t * 1.2 + i * .3) % 1; ctx.beginPath(); ctx.arc(x, y, r + ((t * 1.2 + i * .3) % 1) * 16, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      if (on || c[3]) { ctx.fillStyle = '#0b1220'; ctx.font = '12px JetBrains Mono'; ctx.fillText(c[0], x + 12, y + 4); } });
  })();
})();

/* ---------- Form ---------- */
$('#form').addEventListener('submit', e => {
  e.preventDefault();
  const b = $('.btn b', e.target); b.textContent = 'Sent — thank you ✓'; e.target.reset();
  setTimeout(() => b.textContent = 'Send message', 3500);
});
})();
