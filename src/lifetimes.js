// Animation 1: passing it back. A grid of households, one row per wealth
// decile within their age (richest at the top), drifting left to right as
// they age from 20 to 90. A dot's area is its net worth (ABS 2019-20).
// Gifts and inheritances fly from parents to children at the rates, ages,
// amounts and wealth quintiles the Productivity Commission measured; each
// child's gold core is what they have received so far. The squeeze adds a
// yearly cost that parents must cover before they can gift.

import {
  AGE_MIN, AGE_MAX, ROWS, ROW_LABELS, KINDS,
  wealthAt, drawTransfer, giftFactor, expectedGivenByRow, money,
} from './data.js';

const PER_ROW = 24;
const SPAN = AGE_MAX - AGE_MIN;
// A transfer takes about a year of animation time to arrive, within these
// bounds in real seconds.
const FLIGHT_YEARS = 1.2;
const FLIGHT_MIN_S = 0.35, FLIGHT_MAX_S = 1.5;
const WARMUP_YEARS = SPAN;
const COLORS = { gift: [255, 211, 110], inheritance: [255, 150, 170] };

export function startLifetimes(canvas) {
  const ctx = canvas.getContext('2d');
  const rand = Math.random;
  let W = 0, H = 0, dpr = 1;
  let layout;

  const rows = Array.from({ length: ROWS }, () =>
    Array.from({ length: PER_ROW }, (_, i) => ({ slot: i / PER_ROW, received: 0, flash: 0 })));
  const dots = rows.flat().length;
  let phase = 0;
  let motes = [];
  let fizzles = [];
  let shock = 0;
  let speed = 1; // years per second
  let expected = expectedGivenByRow(0);
  const baseline = expectedGivenByRow(0);
  const due = { gift: rand(), inheritance: rand() };
  const tally = { given: 0, lost: 0 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const narrow = W < 640;
    const left = narrow ? 52 : 92;
    const right = narrow ? 64 : 170;
    const top = 30, bottom = 40;
    const rowH = (H - top - bottom) / ROWS;
    layout = { left, right, top, bottom, rowH, narrow, plotW: W - left - right };
  }

  const ageOf = (dot) => AGE_MIN + ((phase + dot.slot) % 1) * SPAN;
  const xOfAge = (age) => layout.left + ((age - AGE_MIN) / SPAN) * layout.plotW;
  const yOfRow = (r) => layout.top + (ROWS - 1 - r + 0.5) * layout.rowH;

  const maxWealth = Math.max(...Array.from({ length: 71 }, (_, i) => wealthAt(ROWS - 1, AGE_MIN + i)));
  const maxRadius = () => Math.min(layout.rowH * 0.6, (layout.plotW / PER_ROW) * 0.62);
  const radius = (w) => maxRadius() * Math.sqrt(Math.abs(w) / maxWealth);

  function nearest(row, age, olderThan = -Infinity) {
    let best = null, gap = Infinity;
    for (const d of rows[row]) {
      if (ageOf(d) <= olderThan) continue;
      const g = Math.abs(ageOf(d) - age);
      if (g < gap) { gap = g; best = d; }
    }
    return best;
  }

  function spawn(kind, instant) {
    const t = drawTransfer(kind, rand);
    const to = nearest(t.row, t.age);
    // The giver is always older than the receiver.
    const from = nearest(t.fromRow, t.fromAge, ageOf(to) + 1);
    if (!from) return;
    let amount = t.amount;
    if (kind === 'gift') {
      const f = giftFactor(t.fromRow, shock);
      if (f <= 0) {
        tally.lost += t.amount;
        if (!instant) fizzles.push({ row: t.fromRow, age: ageOf(from), t: 0 });
        return;
      }
      tally.lost += amount * (1 - f);
      amount *= f;
      tally.given += amount;
    }
    if (instant) { to.received += amount; return; }
    // The start stays with the giver as they were when they gave: a giver
    // who passes 90 mid-flight wraps to 20, and the mote would fly forwards.
    motes.push({ kind, amount, fromAge: ageOf(from), years: 0, to, fromRow: t.fromRow, toRow: t.row, t: 0,
      bow: rand() * 2 - 1 });
  }

  function step(dt, instant = false) {
    const prev = phase;
    const years = dt * (instant ? 1 : speed);
    phase = (phase + years / SPAN) % 1;
    for (const row of rows) {
      for (const d of row) {
        // A dot that wraps from 90 back to 20 is a new household.
        if ((phase + d.slot) % 1 < (prev + d.slot) % 1) d.received = 0;
        d.flash = Math.max(0, d.flash - dt * 2.5);
      }
    }
    for (const [kind, k] of Object.entries(KINDS)) {
      due[kind] += k.perHousehold * dots * years;
      while (due[kind] >= 1) { due[kind] -= 1; spawn(kind, instant); }
    }
    const kept = [];
    for (const s of motes) {
      s.years += years;
      s.t += dt / Math.min(FLIGHT_MAX_S, Math.max(FLIGHT_MIN_S, FLIGHT_YEARS / speed));
      if (s.t >= 1) { s.to.received += s.amount; s.to.flash = 1; } else kept.push(s);
    }
    motes = kept;
    fizzles = fizzles.filter((f) => { f.age += years; return (f.t += dt / 1.2) < 1; });
    const decay = Math.exp(-dt / 8);
    tally.given *= decay; tally.lost *= decay;
  }

  function motePos(s) {
    const x0 = xOfAge(Math.min(AGE_MAX, s.fromAge + s.years)), y0 = yOfRow(s.fromRow);
    const x1 = xOfAge(ageOf(s.to)), y1 = yOfRow(s.toRow);
    const u = s.t * s.t * (3 - 2 * s.t);
    // A slight bow, up or down, so paths between the same rows don't overlap.
    const bow = Math.min(layout.rowH * 0.3, Math.abs(x1 - x0) * 0.04) * s.bow;
    return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - Math.sin(Math.PI * u) * bow];
  }

  function drawMote(x, y, size, alpha, [r, g, b]) {
    ctx.globalAlpha = alpha;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 2);
    glow.addColorStop(0, `rgba(${r},${g},${b},0.45)`);
    glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, size * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
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
      const label = narrow ? ROW_LABELS[r].replace('Bottom ', '↓').replace('Top ', '↑') : ROW_LABELS[r];
      ctx.fillText(label, left - 10, y);
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(220,226,240,0.55)';
    for (let a = AGE_MIN; a <= AGE_MAX; a += 10) {
      const x = xOfAge(a);
      ctx.fillRect(x, H - bottom + 2, 1, 5);
      ctx.fillText(String(a), x, H - bottom + 18);
    }
    ctx.fillText('age →', left + plotW / 2, H - 8);

    const minR = 1.3;
    for (let r = 0; r < ROWS; r++) {
      const y = yOfRow(r);
      for (const d of rows[r]) {
        const age = ageOf(d);
        const x = xOfAge(age);
        const w = wealthAt(r, age);
        const rad = Math.max(minR, radius(w));
        ctx.globalAlpha = Math.max(0, Math.min(1, (age - AGE_MIN) / 2, (AGE_MAX - age) / 2));
        if (w >= 0) {
          ctx.fillStyle = 'rgb(150,180,255)';
          ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        } else {
          // Negative net worth: owes more than it owns.
          ctx.strokeStyle = 'rgb(150,180,255)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (d.received > 0) {
          ctx.fillStyle = 'rgb(255,211,110)';
          ctx.beginPath(); ctx.arc(x, y, Math.min(rad, Math.max(1, radius(d.received))), 0, Math.PI * 2); ctx.fill();
        }
        if (d.flash > 0) {
          ctx.strokeStyle = `rgba(255,230,150,${d.flash * 0.8})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, rad + 3 + (1 - d.flash) * 6, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    // Gifts that couldn't be afforded: a grey puff at the parent.
    for (const f of fizzles) {
      const x = xOfAge(Math.min(AGE_MAX, f.age)), y = yOfRow(f.row);
      ctx.strokeStyle = `rgba(170,175,190,${0.7 * (1 - f.t)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(x, y, 4 + f.t * 12, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.globalCompositeOperation = 'lighter';
    for (const s of motes) {
      const [x, y] = motePos(s);
      // $500 to $300k spans a tenth to a quarter of a top dot's radius.
      const u = Math.max(0, Math.min(1, Math.log10(s.amount / 500) / Math.log10(600)));
      const size = Math.max(1.5, maxRadius() * (0.1 + 0.15 * u));
      const fade = Math.min(1, s.t * 6, (1 - s.t) * 6);
      drawMote(x, y, size, fade, COLORS[s.kind]);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Gauge: expected dollars passed back per household per year by parents in each row.
    const gx0 = W - right + 12, gw = right - (narrow ? 18 : 70);
    const scale = Math.max(...baseline.map((e) => e.gift + e.inheritance)) * 1.05;
    ctx.textAlign = 'left';
    if (!narrow) {
      ctx.fillStyle = 'rgba(220,226,240,0.55)';
      ctx.fillText('parents pass back / yr', gx0, top - 12);
    }
    for (let r = 0; r < ROWS; r++) {
      const y = yOfRow(r);
      const e = expected[r];
      const wi = (gw * e.inheritance) / scale, wg = (gw * e.gift) / scale;
      const wg0 = (gw * baseline[r].gift) / scale;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(gx0, y - 5, gw, 10);
      ctx.fillStyle = 'rgb(255,150,170)';
      ctx.fillRect(gx0, y - 5, wi, 10);
      ctx.fillStyle = 'rgb(255,211,110)';
      ctx.fillRect(gx0 + wi, y - 5, wg, 10);
      if (wg0 - wg > 0.5) {
        ctx.strokeStyle = 'rgba(255,211,110,0.6)';
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(gx0 + wi + wg, y - 5, wg0 - wg, 10);
        ctx.setLineDash([]);
      }
      if (!narrow) {
        ctx.fillStyle = 'rgba(220,226,240,0.8)';
        ctx.fillText(money(e.gift + e.inheritance), gx0 + gw + 6, y);
      }
    }
  }

  let last = performance.now();
  let paused = false;
  function frame(now) {
    // rAF stamps can precede the performance.now() taken at setup: a negative
    // step would look like every dot wrapping round and wipe the warm-up.
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (!paused) step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  // Run a lifetime first so every dot has had its share already.
  for (let t = 0; t < WARMUP_YEARS; t += 0.1) step(0.1, true);
  tally.given = tally.lost = 0;
  requestAnimationFrame(frame);

  return {
    setShock(v) { shock = v; expected = expectedGivenByRow(v); },
    setPaused(p) { paused = p; },
    setSpeed(v) { speed = v; },
    giftsLostShare() {
      const t = tally.given + tally.lost;
      return t > 0 ? tally.lost / t : 0;
    },
  };
}
