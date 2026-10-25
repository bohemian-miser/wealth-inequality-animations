// Passing it back: a grid of households, one row per income decile (highest
// at the top), drifting left to right as they age from 20 to 90. Every row
// lives the model's life for the chosen house price (src/model.js): rent and
// save, buy, repay, own outright, then help the child in the same row GAP
// years younger. Nothing is random: what you see is the model.

import {
  AGE_MIN, AGE_MAX, YEARS, ROWS, GAP, RENT, MORTGAGE, OWNED, model,
} from './model.js';

const PER_ROW = 28;
const SPAN = AGE_MAX - AGE_MIN;
const FLIGHT_YEARS = 1.2;
const FLIGHT_MIN_S = 0.35, FLIGHT_MAX_S = 1.5;

const COLOR = {
  [RENT]: 'rgb(120,128,150)',
  [MORTGAGE]: 'rgb(120,160,255)',
  [OWNED]: 'rgb(110,225,160)',
  gift: [255, 211, 110],
};

export const ROW_LABELS = [
  'Lowest 10%', '10–20%', '20–30%', '30–40%', '40–50%',
  '50–60%', '60–70%', '70–80%', '80–90%', 'Top 10%',
];

export function startLifetimes(canvas, { prices }) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let layout;
  let lives = [];
  let phase = 0;
  let motes = [];
  let speed = 1;
  let paused = false;

  // One size scale for every price, so dots compare across the slider.
  const maxWealth = Math.max(...prices.map((p) =>
    Math.max(...model(p).flatMap((l) => l.wealth))));

  const dots = Array.from({ length: ROWS }, () =>
    Array.from({ length: PER_ROW }, (_, i) => ({ slot: i / PER_ROW })));

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const narrow = W < 640;
    const left = narrow ? 52 : 92;
    const right = narrow ? 58 : 150;
    const top = 30, bottom = 40;
    layout = { left, right, top, bottom, narrow, rowH: (H - top - bottom) / ROWS, plotW: W - left - right };
  }

  const ageOf = (d) => AGE_MIN + ((phase + d.slot) % 1) * SPAN;
  const xOfAge = (age) => layout.left + ((age - AGE_MIN) / SPAN) * layout.plotW;
  const yOfRow = (r) => layout.top + (ROWS - 1 - r + 0.5) * layout.rowH;
  const maxRadius = () => Math.min(layout.rowH * 0.48, (layout.plotW / PER_ROW) * 0.5);
  const radius = (w) => Math.max(1.5, maxRadius() * Math.sqrt(Math.max(0, w) / maxWealth));
  const at = (life, key, age) => life[key][Math.min(YEARS - 1, Math.max(0, Math.floor(age - AGE_MIN)))];

  // A parent gives this year if they own outright and their child, GAP years
  // younger, still has a mortgage or rent to pay.
  const giving = (life, age) => at(life, 'gives', age) > 0 && age - GAP >= AGE_MIN
    && at(life, 'state', age - GAP) !== OWNED;

  function step(dt) {
    const years = dt * speed;
    const prev = phase;
    phase = (phase + years / SPAN) % 1;
    for (let r = 0; r < ROWS; r++) {
      for (const d of dots[r]) {
        const a0 = AGE_MIN + ((prev + d.slot) % 1) * SPAN;
        const a1 = ageOf(d);
        // One gift a year, on each birthday, while the parent is giving.
        if (a1 > a0 && Math.floor(a1) > Math.floor(a0) && giving(lives[r], a1)) {
          motes.push({ row: r, fromAge: a1, amount: at(lives[r], 'gives', a1), years: 0, t: 0 });
        }
      }
    }
    const flight = Math.min(FLIGHT_MAX_S, Math.max(FLIGHT_MIN_S, FLIGHT_YEARS / speed));
    motes = motes.filter((m) => { m.years += years; return (m.t += dt / flight) < 1; });
  }

  // The arc a gift follows: from the parent to the child GAP years younger,
  // bowing up inside the row so it never leaves its lane.
  function arcPoint(row, fromAge, u) {
    const x0 = xOfAge(Math.min(AGE_MAX, fromAge)), x1 = xOfAge(Math.max(AGE_MIN, fromAge - GAP));
    const y = yOfRow(row);
    return [x0 + (x1 - x0) * u, y - Math.sin(Math.PI * u) * layout.rowH * 0.38];
  }

  function curve(points, style, dash) {
    if (points.length === 0) return;
    ctx.strokeStyle = style;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash);
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [x, y] of points) {
      ctx.fillStyle = style;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  function draw() {
    const { left, right, top, bottom, rowH, narrow, plotW } = layout;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `${narrow ? 10 : 12}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';

    for (let r = 0; r < ROWS; r++) {
      const y = yOfRow(r);
      if (r % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(left, y - rowH / 2, plotW, rowH);
      }
      ctx.fillStyle = 'rgba(220,226,240,0.7)';
      ctx.textAlign = 'right';
      ctx.fillText(narrow ? ROW_LABELS[r].replace('Lowest ', '↓').replace('Top ', '↑') : ROW_LABELS[r], left - 10, y);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(220,226,240,0.55)';
    for (let a = AGE_MIN; a <= AGE_MAX; a += 10) {
      const x = xOfAge(a);
      ctx.fillRect(x, H - bottom + 2, 1, 5);
      ctx.fillText(String(a), x, H - bottom + 18);
    }
    ctx.fillText('age →', left + plotW / 2, H - 8);

    // Who is helping whom: a faint thread from each giving parent to their child.
    ctx.strokeStyle = 'rgba(255,211,110,0.18)';
    ctx.lineWidth = 1;
    for (let r = 0; r < ROWS; r++) {
      for (const d of dots[r]) {
        const age = ageOf(d);
        if (!giving(lives[r], age)) continue;
        ctx.beginPath();
        for (let k = 0; k <= 16; k++) {
          const [x, y] = arcPoint(r, age, k / 16);
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }

    for (let r = 0; r < ROWS; r++) {
      const y = yOfRow(r);
      for (const d of dots[r]) {
        const age = ageOf(d);
        const state = at(lives[r], 'state', age);
        const rad = radius(at(lives[r], 'wealth', age));
        ctx.globalAlpha = Math.max(0, Math.min(1, (age - AGE_MIN) / 2, (AGE_MAX - age) / 2));
        ctx.fillStyle = COLOR[state];
        ctx.beginPath(); ctx.arc(xOfAge(age), y, rad, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // The curves: the age each row buys, and the age it owns outright.
    const buys = [], owns = [];
    for (let r = 0; r < ROWS; r++) {
      const l = lives[r];
      if (l.buyAge !== null) buys.push([xOfAge(l.buyAge + 0.5), yOfRow(r)]);
      if (l.ownAge !== null) owns.push([xOfAge(l.ownAge + 0.5), yOfRow(r)]);
    }
    curve(buys, 'rgba(120,160,255,0.9)', [5, 4]);
    curve(owns, 'rgba(110,225,160,0.95)', []);

    for (const m of motes) {
      const [x, y] = arcPoint(m.row, m.fromAge + m.years, m.t * m.t * (3 - 2 * m.t));
      const size = Math.max(1.6, Math.min(maxRadius() * 0.4, maxRadius() * 0.25 * Math.sqrt(m.amount / 10000)));
      const fade = Math.min(1, m.t * 6, (1 - m.t) * 6);
      const [cr, cg, cb] = COLOR.gift;
      ctx.globalAlpha = fade;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},0.35)`;
      ctx.beginPath(); ctx.arc(x, y, size * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Each row's milestones.
    const gx = W - right + 12;
    ctx.textAlign = 'left';
    if (!narrow) {
      ctx.fillStyle = 'rgba(220,226,240,0.55)';
      ctx.fillText('buys · owns outright', gx, top - 12);
    }
    for (let r = 0; r < ROWS; r++) {
      const l = lives[r];
      const y = yOfRow(r);
      if (l.buyAge === null) {
        ctx.fillStyle = 'rgba(160,166,185,0.8)';
        ctx.fillText(narrow ? 'rents' : 'never buys', gx, y);
        continue;
      }
      ctx.fillStyle = COLOR[MORTGAGE];
      const b = String(l.buyAge);
      ctx.fillText(b, gx, y);
      const sep = narrow ? '→' : ' · ';
      ctx.fillStyle = 'rgba(160,166,185,0.8)';
      ctx.fillText(sep, gx + ctx.measureText(b).width, y);
      ctx.fillStyle = l.ownAge === null ? 'rgba(160,166,185,0.8)' : COLOR[OWNED];
      ctx.fillText(l.ownAge === null ? (narrow ? '—' : 'never') : String(l.ownAge),
        gx + ctx.measureText(b + sep).width, y);
    }
  }

  let last = performance.now();
  function frame(now) {
    // rAF stamps can precede the performance.now() taken at setup.
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
    setPrice(p) { lives = model(p); motes = []; return lives; },
    setPaused(p) { paused = p; },
    setSpeed(v) { speed = v; },
  };
}
