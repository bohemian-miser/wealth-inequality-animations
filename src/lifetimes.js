// Animation 1: lifetimes. A grid of households, one row per wealth decile
// (richest at the top), drifting left to right as they age from 20 to 90.
// A dot's area is its wealth. Older households with something to spare pass
// sparkles of it back to younger ones in their own row; turn up the squeeze
// and the lower rows run out of spare first.

import {
  AGE_MIN, AGE_MAX, DECILE_LABELS, GIVE_FROM_AGE, RECEIVE_AGES,
  baseWealth, needToKeep, money,
} from './data.js';

const ROWS = 10;
const PER_ROW = 24;
const YEARS_PER_SECOND = 1;
const SPAN = AGE_MAX - AGE_MIN;
const GIVE_SHARE = 0.03; // of the surplus, per sparkle
const SPARKLE_RATE = 0.9; // sparkles per second from a full-surplus giver
const SURPLUS_FULL = 300e3; // surplus at which a giver hits that rate
const FLIGHT_S = 1.6;
const FLOW_SMOOTH_S = 6;

export function startLifetimes(canvas, controls) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let layout;

  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const dots = [];
    for (let i = 0; i < PER_ROW; i++) {
      dots.push({ slot: i / PER_ROW, bonus: 0, emit: Math.random(), flash: 0 });
    }
    rows.push({ dots, flow: 0, arrived: 0 });
  }
  let phase = 0;
  let sparkles = [];
  let squeeze = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const narrow = W < 640;
    const left = narrow ? 64 : 96;
    const right = narrow ? 70 : 150;
    const top = 30, bottom = 40;
    const rowH = (H - top - bottom) / ROWS;
    layout = { left, right, top, bottom, rowH, narrow, plotW: W - left - right };
  }

  const ageOf = (dot) => AGE_MIN + ((phase + dot.slot) % 1) * SPAN;
  const xOfAge = (age) => layout.left + ((age - AGE_MIN) / SPAN) * layout.plotW;
  // Row 0 is the bottom decile, drawn lowest.
  const yOfRow = (r) => layout.top + (ROWS - 1 - r + 0.5) * layout.rowH;
  const wealthOf = (r, dot) => Math.max(1e3, baseWealth(r, ageOf(dot)) + dot.bonus);

  function maxRadius() {
    return Math.min(layout.rowH * 0.55, (layout.plotW / PER_ROW) * 0.62);
  }

  function radius(w) {
    // Area ∝ wealth, scaled so the richest dot fills most of its row.
    const maxW = baseWealth(ROWS - 1, 72) * 1.15;
    return Math.max(1.3, maxRadius() * Math.sqrt(w / maxW));
  }

  function step(dt) {
    const prevPhase = phase;
    phase = (phase + (dt * YEARS_PER_SECOND) / SPAN) % 1;
    const need = needToKeep(squeeze);

    for (let r = 0; r < ROWS; r++) {
      const row = rows[r];
      for (const dot of row.dots) {
        // A dot that wraps from 90 back to 20 is a new household.
        const before = (prevPhase + dot.slot) % 1;
        const after = (phase + dot.slot) % 1;
        if (after < before) { dot.bonus = 0; dot.emit = Math.random(); }
        dot.flash = Math.max(0, dot.flash - dt * 2.5);

        const age = ageOf(dot);
        if (age < GIVE_FROM_AGE) continue;
        const surplus = wealthOf(r, dot) - need;
        if (surplus <= 0) continue;
        dot.emit += dt * SPARKLE_RATE * Math.sqrt(Math.min(1, surplus / SURPLUS_FULL));
        if (dot.emit < 1) continue;
        dot.emit -= 1;
        const target = pickReceiver(row);
        if (!target) continue;
        const amount = surplus * GIVE_SHARE;
        dot.bonus -= amount;
        sparkles.push({ row: r, from: dot, to: target, amount, t: 0,
          spin: Math.random() * Math.PI, lift: 0.6 + Math.random() * 0.8 });
      }
    }

    const kept = [];
    for (const s of sparkles) {
      s.t += dt / FLIGHT_S;
      if (s.t >= 1) {
        s.to.bonus += s.amount;
        s.to.flash = 1;
        rows[s.row].arrived += s.amount;
      } else kept.push(s);
    }
    sparkles = kept;

    const k = 1 - Math.exp(-dt / FLOW_SMOOTH_S);
    for (const row of rows) {
      const perYear = row.arrived / (dt * YEARS_PER_SECOND || 1);
      row.flow += (perYear - row.flow) * k;
      row.arrived = 0;
    }
  }

  function pickReceiver(row) {
    const pool = row.dots.filter((d) => {
      const a = ageOf(d);
      return a >= RECEIVE_AGES[0] && a <= RECEIVE_AGES[1];
    });
    return pool.length ? pool[(Math.random() * pool.length) | 0] : null;
  }

  function sparklePos(s) {
    const x0 = xOfAge(ageOf(s.from)), x1 = xOfAge(ageOf(s.to));
    const y = yOfRow(s.row);
    const u = s.t * s.t * (3 - 2 * s.t);
    const x = x0 + (x1 - x0) * u;
    const arc = Math.min(layout.rowH * 0.42, Math.abs(x1 - x0) * 0.2) * s.lift;
    return [x, y - Math.sin(Math.PI * u) * arc];
  }

  function drawStar(x, y, size, rot, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha;
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.2);
    glow.addColorStop(0, 'rgba(255, 220, 120, 0.55)');
    glow.addColorStop(1, 'rgba(255, 200, 80, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, size * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff4c8';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? size : size * 0.28;
      const a = (i * Math.PI) / 4;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function draw(time) {
    const { left, right, top, bottom, rowH, narrow } = layout;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Row bands and labels.
    ctx.font = `${narrow ? 10 : 12}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    for (let r = 0; r < ROWS; r++) {
      const y = yOfRow(r);
      if (r % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(left, y - rowH / 2, layout.plotW, rowH);
      }
      ctx.fillStyle = 'rgba(220,226,240,0.7)';
      ctx.textAlign = 'right';
      ctx.fillText(narrow ? DECILE_LABELS[r].replace('Bottom ', '↓').replace('Top ', '↑') : DECILE_LABELS[r], left - 10, y);
    }

    // The giving zone.
    const gx = xOfAge(GIVE_FROM_AGE);
    ctx.fillStyle = 'rgba(255, 210, 110, 0.035)';
    ctx.fillRect(gx, top, left + layout.plotW - gx, rowH * ROWS);

    // Age axis.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(220,226,240,0.55)';
    for (let a = AGE_MIN; a <= AGE_MAX; a += 10) {
      const x = xOfAge(a);
      ctx.fillRect(x, H - bottom + 2, 1, 5);
      ctx.fillText(String(a), x, H - bottom + 18);
    }
    ctx.fillText('age →', left + layout.plotW / 2, H - 8);

    // Dots.
    for (let r = 0; r < ROWS; r++) {
      const y = yOfRow(r);
      for (const dot of rows[r].dots) {
        const age = ageOf(dot);
        const x = xOfAge(age);
        const w = wealthOf(r, dot);
        const rad = radius(w);
        // Fade in at 20, out at 90.
        const edge = Math.min(1, (age - AGE_MIN) / 2, (AGE_MAX - age) / 2);
        const helped = Math.max(0, Math.min(1, dot.bonus / Math.max(w, 1)));
        const cr = 150 + 105 * helped, cg = 180 + 30 * helped, cb = 255 - 140 * helped;
        ctx.globalAlpha = Math.max(0, edge);
        ctx.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        if (dot.flash > 0) {
          ctx.strokeStyle = `rgba(255,230,150,${dot.flash * 0.9})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, rad + 3 + (1 - dot.flash) * 6, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    // Sparkles, additive.
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sparkles) {
      const [x, y] = sparklePos(s);
      // $100 gifts to $200k gifts span a third to the whole of a top dot's radius.
      const u = Math.max(0, Math.min(1, Math.log10(s.amount / 100) / 3.3));
      const size = maxRadius() * (0.18 + 0.27 * u);
      const twinkle = 0.75 + 0.25 * Math.sin(time * 0.012 + s.spin * 7);
      const fade = Math.min(1, s.t * 6, (1 - s.t) * 6);
      drawStar(x, y, size, s.spin + time * 0.003, twinkle * fade);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Flow gauge: how much each row passes back, log scale $100-$1M a year.
    const gx0 = W - right + 14, gw = right - (narrow ? 22 : 64);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(220,226,240,0.55)';
    if (!narrow) ctx.fillText('passed back / yr', gx0, top - 10);
    for (let r = 0; r < ROWS; r++) {
      const y = yOfRow(r);
      const f = rows[r].flow;
      const u = f < 100 ? 0 : Math.min(1, Math.log10(f / 100) / 4);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(gx0, y - 4, gw, 8);
      ctx.fillStyle = '#ffd36e';
      ctx.fillRect(gx0, y - 4, gw * u, 8);
      if (!narrow) {
        ctx.fillStyle = 'rgba(220,226,240,0.75)';
        ctx.fillText(f < 100 ? '—' : money(f), gx0 + gw + 6, y);
      }
    }
  }

  let last = performance.now();
  let paused = false;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) step(dt);
    draw(now);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);

  return {
    setSqueeze(v) { squeeze = v; },
    setPaused(p) { paused = p; },
    need: () => needToKeep(squeeze),
  };
}
