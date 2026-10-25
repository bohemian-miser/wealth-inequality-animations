// Passing it back, through history: a grid of households, one row per income
// decile (highest at the top), drifting left to right as they age from 20 to
// 90 while the years run from 1970. Each dot is one household of the
// simulation (src/model.js): its colour is renting, paying a mortgage or
// owning outright; its size is its wealth, which for owners rises with the
// house price. Gold dots are parents' yearly help; pink are estates passing
// down at death.
//
// Everything drawn is a function of the time t, so scrubbing and speed
// changes can't desynchronise it. The model applies a year's events at the
// start of the year, so a transfer dot is launched just before and lands
// exactly then: the moment the recipient's dot changes.

import {
  AGE_MIN, AGE_MAX, ROWS, START, SHOW_FROM, END, LAST_PRICE_YEAR,
  RENT, MORTGAGE, OWNED, simulate,
} from './model.js';

const SPAN = AGE_MAX - AGE_MIN;
const FLIGHT_S = 0.7; // real seconds a gift takes...
const FLIGHT_MIN_YEARS = 0.6; // ...but at least this many model years
const FLIGHT_MAX_YEARS = 1.5; // ...and at most this many
const ESTATE_MIN_S = 0.4; // the least real time an estate's flight may take
const HOLD_S = 0.45; // the ring on landing, real seconds...
const HOLD_MAX_YEARS = 0.8; // ...but at most this many model years
const RECENT_YEARS = 10; // the curves average the last this many years' events...
const RECENT_MIN = 3; // ...where there are at least this many

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

const byYear = (events) => {
  const m = new Map();
  for (const e of events) (m.get(e.year) ?? m.set(e.year, []).get(e.year)).push(e);
  return m;
};

export function startLifetimes(canvas, chart, { onYear } = {}) {
  const sim = simulate();
  const ctx = canvas.getContext('2d');
  const cctx = chart.getContext('2d');
  let W = 0, H = 0, CW = 0, CH = 0, dpr = 1;
  let layout;
  let t = SHOW_FROM;
  let speed = 1;
  let paused = false;

  const gifts = byYear(sim.gifts), bequests = byYear(sim.bequests);
  const estateOf = new Map(sim.bequests.map((b) => [b.from, b]));

  // One size scale for every dot, households and transfers alike.
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

  const flightYears = () => Math.min(FLIGHT_MAX_YEARS, Math.max(FLIGHT_MIN_YEARS, FLIGHT_S * speed));
  const holdYears = () => Math.min(HOLD_MAX_YEARS, HOLD_S * speed);
  // An estate leaves when its owner dies (at 90) and lands when the model
  // hands it over (the start of the next year), unless that is too quick to
  // see; then it leaves a little before 90. The dying household is drawn
  // until its estate leaves.
  const estateLaunch = (b) => Math.min(b.from.born + AGE_MAX, b.year - Math.max(0.2, ESTATE_MIN_S * speed));
  const yearIndex = (time) => Math.min(END, Math.floor(time)) - START;
  const xOfAge = (age) => layout.left + ((Math.min(AGE_MAX, Math.max(AGE_MIN, age)) - AGE_MIN) / SPAN) * layout.plotW;
  const yOfRow = (r) => layout.top + (ROWS - 1 - r + 0.5) * layout.rowH;
  const maxRadius = () => Math.min(layout.rowH * 0.5, (layout.plotW / 28) * 0.55);
  const radius = (w, min = 1.5) => Math.max(min, maxRadius() * Math.sqrt(Math.max(0, w) / maxWealth));

  // Transfers in flight or just landed at time t: those of the years whose
  // launch (year − flight) has passed and whose flash hasn't finished.
  function activeTransfers() {
    const f = flightYears(), hold = holdYears();
    const out = [];
    for (let y = Math.floor(t - hold); y <= Math.ceil(t + Math.max(f, 4)); y++) {
      if (t >= y + hold) continue;
      if (t >= y - f) for (const g of gifts.get(y) ?? []) out.push({ kind: 'gift', e: g, launch: y - f, land: y });
      for (const b of bequests.get(y) ?? []) {
        const launch = estateLaunch(b);
        if (t >= launch) out.push({ kind: 'bequest', e: b, launch, land: y });
      }
    }
    return out;
  }

  function step(dt) {
    if (t >= END) return;
    const prev = t;
    t = Math.min(END, t + dt * speed);
    if (Math.floor(t) !== Math.floor(prev)) onYear?.(Math.floor(t));
  }

  function draw() {
    const { left, right, top, bottom, rowH, narrow, plotW } = layout;
    const i = yearIndex(t);
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
        if (age < AGE_MIN) continue;
        // A household leaving an estate is drawn until the estate leaves
        // (held at 90 if that's after its birthday); others fade out at 90.
        const estate = estateOf.get(h);
        if (estate && t >= estateLaunch(estate)) continue;
        if (!estate && age >= AGE_MAX) continue;
        const k = age >= AGE_MAX ? estate.year - 1 - START : i;
        const st = h.st[k];
        if (st < 0) continue;
        const fade = estate ? 1 : Math.min(1, (AGE_MAX - age) / 1.5);
        ctx.globalAlpha = Math.max(0, Math.min(1, (age - AGE_MIN) / 1.5, fade));
        ctx.fillStyle = COLOR[st];
        ctx.beginPath(); ctx.arc(xOfAge(age), y, radius(h.wealth[k]), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // The curves: average age of the row's first-home purchases, and of its
    // mortgages being paid off, over the last RECENT_YEARS years.
    // A row with fewer than RECENT_MIN such events has no point, and the line
    // breaks there.
    const recent = (events, row) => {
      const ages = events.filter((e) => e.row === row && e.year <= t && e.year > t - RECENT_YEARS).map((e) => e.age);
      return ages.length >= RECENT_MIN ? ages.reduce((a, b) => a + b, 0) / ages.length : null;
    };
    // First homes bought with a mortgage (not cash from an estate).
    const firstBuys = sim.buys.filter((e) => e.kind === 'starter' && !e.cash);
    for (const [events, color, dash] of [[firstBuys, 'rgba(120,160,255,0.85)', [5, 4]], [sim.payoffs, 'rgba(110,225,160,0.9)', []]]) {
      ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash);
      ctx.beginPath();
      let joined = false;
      const pts = [];
      for (let r = 0; r < ROWS; r++) {
        const a = recent(events, r);
        if (a === null) { joined = false; continue; }
        const [x, y] = [xOfAge(a), yOfRow(r)];
        joined ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        joined = true;
        pts.push([x, y]);
      }
      ctx.stroke(); ctx.setLineDash([]);
      for (const [x, y] of pts) { ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); }
    }

    // Transfers: full strength until they land, then a brief ring on the recipient.
    for (const m of activeTransfers()) {
      const { e } = m;
      const [cr, cg, cb] = COLOR[m.kind];
      const toX = xOfAge(t - e.to.born), y0 = yOfRow(e.row);
      const size = radius(e.amount, m.kind === 'gift' ? 2 : 3);
      if (t >= m.land) {
        const k = (t - m.land) / holdYears();
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${1 - k})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(toX, y0, radius(e.to.wealth[i]) + 3 + k * 6, 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      const u0 = (t - m.launch) / (m.land - m.launch);
      const u = u0 * u0 * (3 - 2 * u0);
      const fromX = xOfAge(t - e.from.born);
      const bow = m.kind === 'bequest' ? 0.45 : 0.32;
      const x = fromX + (toX - fromX) * u, y = y0 - Math.sin(Math.PI * u) * rowH * bow;
      ctx.globalAlpha = Math.min(1, u0 * 8);
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.3)`;
      ctx.beginPath(); ctx.arc(x, y, size * 1.25, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Each row now: renting / mortgage / owned outright.
    const gx = W - right + 10, gw = right - 18;
    ctx.textAlign = 'left';
    if (!narrow) { ctx.fillStyle = 'rgba(220,226,240,0.55)'; ctx.fillText('the row now', gx, top - 12); }
    for (let r = 0; r < ROWS; r++) {
      const n = [0, 0, 0];
      for (const h of sim.rows[r]) {
        const age = t - h.born;
        if (age >= AGE_MIN && age < AGE_MAX && h.st[i] >= 0) n[h.st[i]]++;
      }
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
    const every = CW < 640 ? 20 : 10;
    for (let y = SHOW_FROM; y <= END; y += every) cctx.fillText(String(y), xOf(y), CH - 8);
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
    seek(year) { t = Math.max(SHOW_FROM, Math.min(END, year)); onYear?.(Math.floor(t)); },
    setPaused(p) { paused = p; },
    setSpeed(v) { speed = v; },
    ended: () => t >= END,
  };
}
