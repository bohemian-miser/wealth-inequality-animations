// When things happen on screen. Pure (no DOM), shared by the page and the
// tests.
//
// The model steps whole calendar years: everything a household does in year
// Y happens at once. Drawn that way, the whole board ticks on 1 January. So
// each household is shown on its own clock: its model year Y is drawn from
// Y + phase to Y + 1 + phase, with a phase in [0, 1) fixed per household.
// Transfers land at the moment their recipient's year turns over, which is
// when the recipient's dot changes.

import { START, END } from './model.js';

const GOLDEN = 0.6180339887498949;

export function phaseOf(h) {
  const x = h.born * GOLDEN + h.row * (1 - GOLDEN);
  return x - Math.floor(x);
}

// The model year a household is showing at time t, clamped to the years it
// has a state: from its first year at 20 (so a new household shows at once)
// to its last before it died.
export function shownYear(h, t) {
  let y = Math.floor(t - phaseOf(h));
  const first = Math.ceil(h.born + 20);
  if (y < first) y = first;
  if (h.died !== null && y >= h.died) y = h.died - 1;
  return Math.max(START, Math.min(END, y));
}

// How far through that year it is, 0..1.
export function shownFraction(h, t) {
  const x = t - phaseOf(h);
  return x - Math.floor(x);
}

// The years in which each household receives an estate or help to buy (a
// lump that should jump on landing, not ease in before it).
export function estateArrivals(bequests, gifts = []) {
  const m = new Map();
  for (const e of [...bequests, ...gifts]) (m.get(e.to) ?? m.set(e.to, new Set()).get(e.to)).add(e.year);
  return m;
}

// A household's state and wealth as drawn at time t. Wealth eases towards
// next year's, except into a year an estate or help arrives (that jumps on
// landing).
export function shownState(h, t, arrivals) {
  const y = shownYear(h, t);
  const k = y - START;
  const st = h.st[k];
  let w = h.wealth[k];
  const next = k + 1;
  if (next <= END - START && h.st[next] >= 0 && !arrivals.get(h)?.has(y + 1)) {
    w += (h.wealth[next] - w) * shownFraction(h, t);
  }
  return { st, w };
}

// A transfer from year Y lands when the recipient's year Y begins on screen.
export const landing = (e) => e.year + phaseOf(e.to);

// Flight times are in model years and don't depend on speed, so a moment
// always looks the same whatever the speed (speed only runs the clock).
export const GIFT_FLIGHT = 0.8;
export const ESTATE_MIN_FLIGHT = 0.6;

export function giftTiming(g) {
  const land = landing(g);
  return { launch: land - GIFT_FLIGHT, land };
}

// An estate leaves when its owner dies, or, if the hand-over follows too soon
// to see it fly, a little before.
export function estateTiming(b) {
  const land = landing(b);
  return { launch: Math.min(b.from.born + b.from.deathAge, land - ESTATE_MIN_FLIGHT), land };
}

// Is a household on screen at time t? From 20 until it dies, or, if it
// leaves an estate, until the estate leaves.
export function onScreen(h, t, estate) {
  const age = t - h.born;
  if (age < 20) return false;
  if (estate) return t < estateTiming(estate).launch;
  return age < h.deathAge;
}

export function byYear(events) {
  const m = new Map();
  for (const e of events) (m.get(e.year) ?? m.set(e.year, []).get(e.year)).push(e);
  return m;
}

// Transfers in flight at time t, or (estates) just landed within `hold`.
export function activeTransfers(gifts, bequests, t, hold) {
  const out = [];
  for (let y = Math.floor(t - hold) - 1; y <= Math.ceil(t) + 2; y++) {
    for (const g of gifts.get(y) ?? []) {
      const { launch, land } = giftTiming(g);
      if (t >= launch && t < land) out.push({ kind: 'gift', e: g, launch, land });
    }
    for (const b of bequests.get(y) ?? []) {
      const { launch, land } = estateTiming(b);
      if (t >= launch && t < land + hold) out.push({ kind: 'bequest', e: b, launch, land });
    }
  }
  return out;
}
