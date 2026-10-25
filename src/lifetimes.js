// Passing it back, through history: a grid of households, one row per income
// decile (highest at the top), drifting left to right as they age from 20 to
// 90 while the years run from 1970. Each dot is one household of the
// simulation (src/model.js): its colour is renting, paying a mortgage or
// owning outright; its size is its wealth, which for owners rises with the
// house price. Gold dots are parents' yearly help; pink are estates passing
// down at death.

import {
  AGE_MIN, AGE_MAX, ROWS, START, SHOW_FROM, END, LAST_PRICE_YEAR,
  RENT, MORTGAGE, OWNED, simulate,
} from './model.js';

const SPAN = AGE_MAX - AGE_MIN;
const FLIGHT_YEARS = 1.2;
const FLIGHT_MIN_S = 0.4, FLIGHT_MAX_S = 1.6;
const BEQUEST_FLIGHT_S = 1.8;

export const COLOR = {
  [RENT]: 'rgb(120,128,150)',
  [MORTGAGE]: 'rgb(120,160,255)',
  [OWNED]: 'rgb(110,225,160)',
  gift: [255, 211, 110],
  bequest: [255, 140, 170],
};

export const ROW_LABELS = [
  'Lowest 10%', '10–20%', '20–30%', '30–40%', '40–50%',
  '50–60%', '60–70%', '70–80%', '80–90%', 'Top 10%',
];

export function startLifetimes(canvas, chart, { onYear } = {}) {
  const sim = simulate();
  const ctx = canvas.getContext('2d');
  const cctx = chart.getContext('2d');
  let W = 0, H = 0, CW = 0, CH = 0, dpr = 1;
  let layout;
  let t = SHOW_FROM;
  let speed = 1;
  let paused = false;
  let motes = [];

  const giftsByYear = new Map(), bequestsByYear = new Map();
  for (const g of sim.gifts) (giftsByYear.get(g.year) ?? giftsByYear.set(g.year, []).get(g.year)).push(g);
  for (const b of sim.bequests) (bequestsByYear.get(b.year) ?? bequestsByYear.set(b.year, []).get(b.year)).push(b);

  // One size scale for the whole run, so dots compare across the years.
  let maxWealth = 1;
  for (const hs of sim.rows) for (const h of hs) {
    for (let yi = SHOW_FROM - START; yi <= END - START; yi++) maxWealth = Math.max(maxWealth, h.wealth[yi]);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const c = chart.getBoundingClientRect();
    CW = c.width; CH = c.height;
    chart.width = Math.round(CW * dpr); chart.height = Math.round(CH * dpr);
    const narrow = W < 640;
    const left = narrow ? 52 : 92;
    const right = narrow ? 44 : 120;
    const top = 30, bottom = 40;
    layout = { left, right, top, bottom, narrow, rowH: (H - top - bottom) / ROWS, plotW: W - left - right };
  }

  const yi = () => Math.min(END, Math.floor(t)) - START;
  const xOfAge = (age) => layout.left + ((age - AGE_MIN) / SPAN) * layout.plotW;
  const yOfRow = (r) => layout.top + (ROWS - 1 - r + 0.5) * layout.rowH;
  const maxRadius = () => Math.min(layout.rowH * 0.5, (layout.plotW / 28) * 0.55);
  const radius = (w) => Math.max(1.5, maxRadius() * Math.sqrt(Math.max(0, w) / maxWealth));
  const alive = (h, time) => time - h.born >= AGE_MIN && time - h.born < AGE_MAX;

  function spawnYear(year) {
    for (const g of giftsByYear.get(year) ?? []) {
      motes.push({ kind: 'gift', row: g.row, from: g.from, to: g.to, amount: g.amount, t: 0 });
    }
    for (const b of bequestsByYear.get(year) ?? []) {
      motes.push({ kind: 'bequest', row: b.row, from: b.from, to: b.to, amount: b.amount, t: 0 });
    }
  }

  function step(dt) {
    if (t >= END) return;
    const prev = t;
    t = Math.min(END, t + dt * speed);
    for (let y = Math.floor(prev) + 1; y <= Math.floor(t); y++) spawnYear(y);
    if (Math.floor(t) !== Math.floor(prev)) onYear?.(Math.floor(t));
    const giftFlight = Math.min(FLIGHT_MAX_S, Math.max(FLIGHT_MIN_S, FLIGHT_YEARS / speed));
    motes = motes.filter((m) => (m.t += dt / (m.kind === 'gift' ? giftFlight : BEQUEST_FLIGHT_S)) < 1);
  }

  // A transfer's path: from giver to receiver, bowing up inside the row.
  function arcPoint(m, u) {
    const x0 = xOfAge(Math.min(AGE_MAX, t - m.from.born)), x1 = xOfAge(Math.max(AGE_MIN, t - m.to.born));
    const bow = m.kind === 'bequest' ? 0.45 : 0.32;
    return [x0 + (x1 - x0) * u, yOfRow(m.row) - Math.sin(Math.PI * u) * layout.rowH * bow];
  }

  function frontier(row, test) {
    // The youngest age from which every older household in the row passes.
    const hs = sim.rows[row].filter((h) => alive(h, t)).sort((a, b) => a.born - b.born);
    const i = yi();
    let age = null;
    for (const h of hs) {
      if (test(h.st[i])) age = t - h.born; else break;
    }
    return age;
  }

  function curve(points, style, dash) {
    if (points.length < 1) return;
    ctx.strokeStyle = style; ctx.lineWidth = 2; ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke(); ctx.setLineDash([]);
  }

  function draw() {
    const { left, right, top, bottom, rowH, narrow, plotW } = layout;
    const i = yi();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `${narrow ? 10 : 12}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';

    for (let r = 0; r < ROWS; r++) {
      const y = yOfRow(r);
      if (r % 2 === 1) { ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fillRect(left, y - rowH / 2, plotW, rowH); }
      ctx.fillStyle = 'rgba(220,226,240,0.7)'; ctx.textAlign = 'right';
      ctx.fillText(narrow ? ROW_LABELS[r].replace('Lowest ', '↓').replace('Top ', '↑') : ROW_LABELS[r], left - 10, y);
    }
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(220,226,240,0.55)';
    for (let a = AGE_MIN; a <= AGE_MAX; a += 10) {
      const x = xOfAge(a);
      ctx.fillRect(x, H - bottom + 2, 1, 5);
      ctx.fillText(String(a), x, H - bottom + 18);
    }
    ctx.fillText('age →', left + plotW / 2, H - 8);

    for (let r = 0; r < ROWS; r++) {
      const y = yOfRow(r);
      for (const h of sim.rows[r]) {
        const age = t - h.born;
        if (age < AGE_MIN || age >= AGE_MAX) continue;
        const st = h.st[i];
        if (st < 0) continue;
        ctx.globalAlpha = Math.max(0, Math.min(1, (age - AGE_MIN) / 1.5, (AGE_MAX - age) / 1.5));
        ctx.fillStyle = COLOR[st];
        ctx.beginPath(); ctx.arc(xOfAge(age), y, radius(h.wealth[i]), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Frontiers: from what age everyone in the row has bought, and owns outright.
    const buys = [], owns = [];
    for (let r = 0; r < ROWS; r++) {
      const b = frontier(r, (s) => s !== RENT);
      const o = frontier(r, (s) => s === OWNED);
      if (b !== null && b > AGE_MIN + 1) buys.push([xOfAge(b), yOfRow(r)]);
      if (o !== null && o > AGE_MIN + 1) owns.push([xOfAge(o), yOfRow(r)]);
    }
    curve(buys, 'rgba(120,160,255,0.85)', [5, 4]);
    curve(owns, 'rgba(110,225,160,0.9)', []);

    for (const m of motes) {
      if (!alive(m.to, t)) continue;
      const [x, y] = arcPoint(m, m.t * m.t * (3 - 2 * m.t));
      const [cr, cg, cb] = COLOR[m.kind];
      const size = m.kind === 'gift'
        ? Math.max(1.6, Math.min(maxRadius() * 0.4, maxRadius() * 0.25 * Math.sqrt(m.amount / 10000)))
        : Math.max(3, radius(m.amount) * 0.8);
      ctx.globalAlpha = Math.min(1, m.t * 6, (1 - m.t) * 6);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.3)`;
      ctx.beginPath(); ctx.arc(x, y, size * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Each row now: renting / mortgage / owned outright.
    const gx = W - right + 10, gw = right - 18;
    ctx.textAlign = 'left';
    if (!narrow) { ctx.fillStyle = 'rgba(220,226,240,0.55)'; ctx.fillText('the row now', gx, top - 12); }
    for (let r = 0; r < ROWS; r++) {
      const n = [0, 0, 0];
      for (const h of sim.rows[r]) if (alive(h, t) && h.st[i] >= 0) n[h.st[i]]++;
      const total = n[0] + n[1] + n[2] || 1;
      let x = gx;
      for (const s of [RENT, MORTGAGE, OWNED]) {
        const w = (gw * n[s]) / total;
        ctx.fillStyle = COLOR[s];
        ctx.fillRect(x, yOfRow(r) - 5, w, 10);
        x += w;
      }
    }
    drawChart();
  }

  // The strip chart: house price, under-40s owning, over-65s' share of homes.
  function drawChart() {
    const pad = { l: 46, r: 46, t: 10, b: 20 };
    const w = CW - pad.l - pad.r, h = CH - pad.t - pad.b;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cctx.clearRect(0, 0, CW, CH);
    cctx.font = '11px system-ui, sans-serif';
    cctx.textBaseline = 'middle';
    const xOf = (year) => pad.l + ((year - SHOW_FROM) / (END - SHOW_FROM)) * w;
    const yOfPrice = (p) => pad.t + h - (p / 1e6) * h;
    const yOfPct = (v) => pad.t + h - v * h;
    cctx.strokeStyle = 'rgba(255,255,255,0.08)'; cctx.lineWidth = 1;
    for (const v of [0, 0.5, 1]) { cctx.beginPath(); cctx.moveTo(pad.l, yOfPct(v)); cctx.lineTo(pad.l + w, yOfPct(v)); cctx.stroke(); }
    cctx.fillStyle = 'rgba(220,226,240,0.55)';
    cctx.textAlign = 'right';
    for (const [p, label] of [[0, '$0'], [500e3, '$500k'], [1e6, '$1M']]) cctx.fillText(label, pad.l - 6, yOfPrice(p));
    cctx.textAlign = 'left';
    for (const v of [0, 0.5, 1]) cctx.fillText(`${v * 100}%`, pad.l + w + 6, yOfPct(v));
    cctx.textAlign = 'center';
    for (let y = SHOW_FROM; y <= END; y += 10) cctx.fillText(String(y), xOf(y), CH - 8);
    // After the data: held at the last year's price.
    cctx.fillStyle = 'rgba(255,255,255,0.03)';
    cctx.fillRect(xOf(LAST_PRICE_YEAR), pad.t, xOf(END) - xOf(LAST_PRICE_YEAR), h);
    const series = [
      { color: 'rgba(235,238,248,0.9)', y: (s) => yOfPrice(s.price) },
      { color: 'rgb(120,160,255)', y: (s) => yOfPct(s.youngOwn / s.young) },
      { color: 'rgb(255,140,170)', y: (s) => yOfPct(s.homesOld / s.homes) },
    ];
    const upto = Math.min(END, Math.floor(t));
    for (const sr of series) {
      cctx.strokeStyle = sr.color; cctx.lineWidth = 2;
      cctx.beginPath();
      for (let y = SHOW_FROM; y <= upto; y++) {
        const s = sim.stats[y - START];
        y === SHOW_FROM ? cctx.moveTo(xOf(y), sr.y(s)) : cctx.lineTo(xOf(y), sr.y(s));
      }
      cctx.stroke();
    }
    cctx.strokeStyle = 'rgba(255,255,255,0.5)'; cctx.lineWidth = 1;
    cctx.beginPath(); cctx.moveTo(xOf(t), pad.t); cctx.lineTo(xOf(t), pad.t + h); cctx.stroke();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!paused) step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return {
    sim,
    year: () => t,
    stats: () => sim.stats[yi()],
    seek(year) { t = Math.max(SHOW_FROM, Math.min(END, year)); motes = []; onYear?.(Math.floor(t)); },
    setPaused(p) { paused = p; },
    setSpeed(v) { speed = v; },
    ended: () => t >= END,
  };
}
