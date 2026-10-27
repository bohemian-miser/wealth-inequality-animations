// Passing it back, through history: a grid of households, one row per income
// decile (highest at the top), drifting left to right as they age from 20 to
// 90 while the years run from 1970. Each dot is one household of the
// simulation (src/model.js): its colour is renting, paying a mortgage or
// owning outright; its size is its wealth, which for owners rises with the
// house price. Gold dots are parents' yearly help; pink are estates passing
// down at death.
//
// Everything drawn is a function of the time t (see src/timeline.js), so
// scrubbing and speed changes can't desynchronise it. Each household shows
// its model years on its own clock, so the board doesn't tick all at once on
// 1 January; a transfer lands at the moment its recipient's dot changes.

import {
  AGE_MIN, AGE_MAX, ROWS, SPACING, START, SHOW_FROM, END, LAST_PRICE_YEAR,
  RENT, MORTGAGE, OWNED, simulate,
} from './model.js';
import { DATA } from './data.generated.js';
import {
  shownState, shownYear, estateArrivals, onScreen, byYear, activeTransfers,
} from './timeline.js';

const SPAN = AGE_MAX - AGE_MIN;
const HOLD_YEARS = 0.5; // an estate's ring on landing, in model years
const RECENT_YEARS = 15; // the curves average the last this many years' events...
const RECENT_MIN = 5; // ...where there are at least this many

export const COLOR = {
  [RENT]: 'rgb(120,128,150)',
  [MORTGAGE]: 'rgb(120,160,255)',
  [OWNED]: 'rgb(110,225,160)',
  gift: [255, 211, 110],
  bequest: [255, 140, 170],
};

export const ROW_LABELS = [
  'Lowest tenth', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', 'Top tenth',
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

  const gifts = byYear(sim.gifts), bequests = byYear(sim.bequests);
  const estateOf = new Map(sim.bequests.map((b) => [b.from, b]));
  const arrivals = estateArrivals(sim.bequests, sim.gifts);
  const firstBuys = sim.buys.filter((e) => e.kind === 'starter' && !e.cash);
  const helped = new Map(sim.gifts.map((g) => [g.to, g.year])); // household → year helped

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

  const xOfAge = (age) => layout.left + ((Math.min(AGE_MAX, Math.max(AGE_MIN, age)) - AGE_MIN) / SPAN) * layout.plotW;
  const yOfRow = (r) => layout.top + (ROWS - 1 - r + 0.5) * layout.rowH;
  // Households in a row are SPACING years apart: the biggest dot fills about one gap.
  const maxRadius = () => Math.min(layout.rowH * 0.5, (layout.plotW / ((AGE_MAX - AGE_MIN) / SPACING)) * 0.75);
  const radius = (w, min = 1.5) => Math.max(min, maxRadius() * Math.sqrt(Math.max(0, w) / maxWealth));

  const shown = (h) => shownState(h, t, arrivals);

  function step(dt) {
    if (t >= END) return;
    const prev = t;
    t = Math.max(SHOW_FROM, Math.min(END, t + dt * speed));
    if (Math.floor(t) !== Math.floor(prev)) onYear?.(Math.floor(t));
  }

  function draw() {
    const { left, right, top, bottom, rowH, narrow, plotW } = layout;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `${narrow ? 10 : 12}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';

    for (let r = 0; r < ROWS; r++) {
      const y = yOfRow(r);
      if (r % 2 === 1) { ctx.fillStyle = 'rgba(255,255,255,0.025)'; ctx.fillRect(left, y - rowH / 2, plotW, rowH); }
      ctx.fillStyle = 'rgba(220,226,240,0.7)'; ctx.textAlign = 'right';
      ctx.fillText(narrow ? String(r + 1) : ROW_LABELS[r], left - 10, y);
    }
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(220,226,240,0.55)';
    for (let a = AGE_MIN; a <= AGE_MAX; a += 10) {
      const x = xOfAge(a);
      ctx.fillRect(x, H - bottom + 2, 1, 5);
      ctx.fillText(String(a), x, H - bottom + 18);
    }
    ctx.fillText('age →', left + plotW / 2, H - 8);

    // Dots and transfers stay inside the plot, clear of the labels and bars.
    ctx.save();
    ctx.beginPath(); ctx.rect(left - 14, 0, plotW + 28, H - bottom); ctx.clip();
    for (let r = 0; r < ROWS; r++) {
      const y = yOfRow(r);
      for (const h of sim.rows[r]) {
        // A household leaving an estate is drawn until the estate leaves
        // (held at 90 if that's after its birthday); others fade out at 90.
        const estate = estateOf.get(h);
        if (!onScreen(h, t, estate)) continue;
        const { st, w } = shown(h);
        if (st < 0) continue;
        const age = t - h.born;
        const fade = estate ? 1 : Math.min(1, (h.deathAge - age) / 0.5);
        ctx.globalAlpha = Math.max(0, Math.min(1, (age - AGE_MIN) / 1.5, fade));
        ctx.fillStyle = COLOR[st];
        ctx.beginPath(); ctx.arc(xOfAge(age), y, radius(w), 0, Math.PI * 2); ctx.fill();
        // Bought with family help: a gold outline, for as long as it owns.
        if (helped.has(h) && st !== RENT && shownYear(h, t) >= helped.get(h)) {
          ctx.strokeStyle = 'rgba(255,211,110,0.85)'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(xOfAge(age), y, radius(w) + 1.2, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    // The curves: average age of the row's first-home purchases, and of its
    // mortgages being paid off, over the last RECENT_YEARS years.
    // A row with fewer than RECENT_MIN such events has no point, and the line
    // breaks there.
    // Each point is the median age of the row's events, pooled with its
    // neighbouring rows at half weight: a row alone has too few to be steady.
    const recent = (events, row) => {
      const inWindow = events.filter((e) => e.year <= t && e.year > t - RECENT_YEARS && Math.abs(e.row - row) <= 1);
      const own = inWindow.filter((e) => e.row === row).length;
      if (own < RECENT_MIN) return null;
      const weighted = inWindow.map((e) => [e.age, e.row === row ? 1 : 0.5]).sort((a, b) => a[0] - b[0]);
      const half = weighted.reduce((a, [, w]) => a + w, 0) / 2;
      let acc = 0;
      for (const [age, w] of weighted) { acc += w; if (acc >= half) return age; }
      return null;
    };
    // First homes bought with a mortgage (not cash from an estate).
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

    // Transfers: full strength until they land; an estate then rings its heir.
    for (const m of activeTransfers(gifts, bequests, t, HOLD_YEARS)) {
      const { e } = m;
      const [cr, cg, cb] = COLOR[m.kind];
      const toX = xOfAge(t - e.to.born), y0 = yOfRow(e.row);
      if (t >= m.land) {
        const k = (t - m.land) / HOLD_YEARS;
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${1 - k})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(toX, y0, radius(shown(e.to).w) + 3 + k * 6, 0, Math.PI * 2); ctx.stroke();
        continue;
      }
      const u0 = (t - m.launch) / (m.land - m.launch);
      const u = u0 * u0 * (3 - 2 * u0);
      const fromX = xOfAge(t - e.from.born);
      const bow = m.kind === 'bequest' ? 0.45 : 0.32;
      const x = fromX + (toX - fromX) * u, y = y0 - Math.sin(Math.PI * u) * rowH * bow;
      const size = radius(e.amount, m.kind === 'gift' ? 1.8 : 3);
      // An estate takes over from its owner's dot, so it starts at full strength.
      ctx.globalAlpha = m.kind === 'gift' ? 0.8 * Math.min(1, u0 * 8) : 1;
      if (m.kind === 'bequest') {
        ctx.fillStyle = `rgba(${cr},${cg},${cb},0.3)`;
        ctx.beginPath(); ctx.arc(x, y, size * 1.25, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Each row now: renting / mortgage / owned outright.
    const gx = W - right + 18, gw = right - 24;
    ctx.textAlign = 'left';
    if (!narrow) { ctx.fillStyle = 'rgba(220,226,240,0.55)'; ctx.fillText('the row now', gx, top - 12); }
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(220,226,240,0.55)';
    ctx.fillText(narrow ? 'income ↑' : 'lifetime income ↑', 6, top - 12);
    for (let r = 0; r < ROWS; r++) {
      const n = [0, 0, 0];
      for (const h of sim.rows[r]) {
        const age = t - h.born;
        if (age < AGE_MIN || age >= h.deathAge) continue;
        const { st } = shown(h);
        if (st >= 0) n[st]++;
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
  // The chart: two stacked panels sharing the years, so a price line and a
  // percentage line never seem to cross. Top: the house price. Bottom:
  // 25–39s owning (with the Census) and over-65s' share of owned homes.
  function drawChart() {
    const pad = { l: 46, r: CW >= 640 ? 150 : 40, t: 8, b: 20, gap: 12 };
    const w = CW - pad.l - pad.r;
    const hTop = Math.round((CH - pad.t - pad.b - pad.gap) * 0.38);
    const hBot = CH - pad.t - pad.b - pad.gap - hTop;
    const top0 = pad.t, bot0 = pad.t + hTop + pad.gap;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cctx.clearRect(0, 0, CW, CH);
    cctx.font = '11px system-ui, sans-serif';
    cctx.textBaseline = 'middle';
    const xOf = (year) => pad.l + ((year - SHOW_FROM) / (END - SHOW_FROM)) * w;
    const PRICE_MAX = 1e6;
    const yOfPrice = (p) => top0 + hTop - (p / PRICE_MAX) * hTop;
    const yOfPct = (v) => bot0 + hBot - v * hBot;
    const muted = 'rgba(220,226,240,0.55)';
    // Frames, gridlines and axes.
    cctx.strokeStyle = 'rgba(255,255,255,0.08)'; cctx.lineWidth = 1;
    for (const y of [yOfPrice(0), yOfPrice(5e5), yOfPrice(1e6), yOfPct(0), yOfPct(0.5), yOfPct(1)]) {
      cctx.beginPath(); cctx.moveTo(pad.l, y); cctx.lineTo(pad.l + w, y); cctx.stroke();
    }
    cctx.fillStyle = muted; cctx.textAlign = 'right';
    for (const [p, label] of [[0, '$0'], [5e5, '$500k'], [1e6, '$1M']]) cctx.fillText(label, pad.l - 6, yOfPrice(p));
    for (const v of [0, 0.5, 1]) cctx.fillText(`${v * 100}%`, pad.l - 6, yOfPct(v));
    cctx.textAlign = 'center';
    const every = CW < 640 ? 20 : 10;
    for (let y = SHOW_FROM; y <= END; y += every) cctx.fillText(String(y), xOf(y), CH - 8);
    // After the data: held at the last year's price and rates.
    cctx.fillStyle = 'rgba(255,255,255,0.03)';
    cctx.fillRect(xOf(LAST_PRICE_YEAR), top0, xOf(END) - xOf(LAST_PRICE_YEAR), CH - pad.t - pad.b);
    cctx.fillStyle = 'rgba(220,226,240,0.6)'; cctx.textAlign = 'left';
    cctx.fillText(CW < 640 ? 'what-if' : 'what-if: prices, rates and incomes held after 2025', xOf(LAST_PRICE_YEAR) + 6, top0 + 8);
    if (CW >= 640) {
      cctx.fillStyle = 'rgba(220,226,240,0.45)';
      cctx.fillText('ownership keeps falling as people who bought cheaply age past 39', xOf(LAST_PRICE_YEAR) + 6, bot0 + hBot - 8);
    }
    cctx.fillStyle = 'rgba(220,226,240,0.5)'; cctx.textAlign = 'left'; cctx.font = '10px system-ui, sans-serif';
    cctx.fillText('house price', pad.l + 4, top0 + 8);
    cctx.fillText('who owns', pad.l + 4, bot0 + 8);
    cctx.font = '11px system-ui, sans-serif';
    // The shares are averaged over the last 5 years (households are born every
    // 1.25 years in a row, which otherwise adds noise).
    const series = [
      { label: 'house price (2019-20 $)', color: 'rgba(235,238,248,0.9)', at: (y) => yOfPrice(sim.stats[y - START].price) },
      { label: '25–39s who own', color: 'rgb(120,160,255)', at: (y) => yOfPct(avg(y, (s) => s.youngOwn / s.young)) },
      { label: "over 65s' share of homes", color: 'rgb(255,140,170)', at: (y) => yOfPct(avg(y, (s) => s.homesOld / s.homes)) },
    ];
    function avg(y, f) {
      let sum = 0, n = 0;
      for (let k = Math.max(SHOW_FROM, y - 4); k <= y; k++) { sum += f(sim.stats[k - START]); n++; }
      return sum / n;
    }
    const upto = Math.min(END, Math.floor(t));
    for (const sr of series) {
      cctx.strokeStyle = sr.color; cctx.fillStyle = sr.color; cctx.lineWidth = 2;
      cctx.beginPath();
      for (let y = SHOW_FROM; y <= upto; y++) y === SHOW_FROM ? cctx.moveTo(xOf(y), sr.at(y)) : cctx.lineTo(xOf(y), sr.at(y));
      cctx.stroke();
      cctx.beginPath(); cctx.arc(xOf(upto), sr.at(upto), 2.5, 0, Math.PI * 2); cctx.fill();
    }
    // Census: home ownership at 25–39 (the three 5-year groups, averaged).
    cctx.fillStyle = 'rgb(120,160,255)';
    for (const y of Object.keys(DATA.censusOwnByAge['25–29']).map(Number)) {
      if (y < SHOW_FROM || y > upto) continue;
      const v = (DATA.censusOwnByAge['25–29'][y] + DATA.censusOwnByAge['30–34'][y] + DATA.censusOwnByAge['35–39'][y]) / 3;
      cctx.strokeStyle = 'rgba(13,16,32,1)'; cctx.lineWidth = 1.5;
      cctx.beginPath(); cctx.arc(xOf(y), yOfPct(v), 3.5, 0, Math.PI * 2); cctx.fill(); cctx.stroke();
    }
    // Labels in the right margin, level with each line's latest value.
    if (CW >= 640) {
      cctx.font = '10.5px system-ui, sans-serif'; cctx.textAlign = 'left';
      cctx.fillStyle = series[0].color; cctx.fillText(series[0].label, pad.l + w + 8, series[0].at(upto));
      // The two ownership labels (and the Census key) kept at least 13px apart.
      const labels = [[series[1].label, series[1].color, series[1].at(upto)], [series[2].label, series[2].color, series[2].at(upto)]]
        .sort((a, b) => a[2] - b[2]);
      labels.push(['● Census (25–39s)', series[1].color, 0]);
      let yPrev = -Infinity;
      for (const l of labels) {
        const y = Math.min(bot0 + hBot - 4, Math.max(l[2] || yPrev + 13, yPrev + 13));
        cctx.fillStyle = l[1]; cctx.fillText(l[0], pad.l + w + 8, y); yPrev = y;
      }
      cctx.font = '11px system-ui, sans-serif';
    }
    cctx.strokeStyle = 'rgba(255,255,255,0.5)'; cctx.lineWidth = 1;
    for (const [y0, hh] of [[top0, hTop], [bot0, hBot]]) {
      cctx.beginPath(); cctx.moveTo(xOf(t), y0); cctx.lineTo(xOf(t), y0 + hh); cctx.stroke();
    }
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
    seek(year) {
      if (!Number.isFinite(year)) return;
      t = Math.max(SHOW_FROM, Math.min(END, year));
      onYear?.(Math.floor(t));
    },
    setPaused(p) { paused = p; },
    setSpeed(v) { if (Number.isFinite(v) && v > 0) speed = v; },
    ended: () => t >= END,
    radiusFor: (w) => radius(w),
    // A statistic averaged over the 5 years to `year` (as the chart draws it).
    smoothed(year, f) {
      let sum = 0, n = 0;
      for (let k = Math.max(SHOW_FROM, year - 4); k <= year; k++) { sum += f(sim.stats[k - START]); n++; }
      return sum / n;
    },
  };
}
