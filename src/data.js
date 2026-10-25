// What the animations read off the data: wealth by row and age, and the
// transfer model. Every number comes from src/data.generated.js (built from
// the published tables by scripts/build_data.py); the assumptions that join
// them up are the constants below, each named in data/SOURCES.md.

import { DATA } from './data.generated.js';

export { DATA };

export const AGE_MIN = 20;
export const AGE_MAX = 90;
export const ROWS = 10;

// Assumption: a parent is this many years older than their child.
export const GENERATION_GAP = 30;

export const ROW_LABELS = [
  'Bottom 10%', '10–20%', '20–30%', '30–40%', '40–50%',
  '50–60%', '60–70%', '70–80%', '80–90%', 'Top 10%',
];

export const quintileOf = (row) => row >> 1;

// Mean net worth of a household in wealth decile `row` (0 = bottom, within
// its age band) at `age`, linear between the bands' midpoints.
export function wealthAt(row, age) {
  const mid = DATA.ageMid;
  const col = (i) => DATA.bandDeciles[i][row];
  if (age <= mid[0]) return col(0);
  for (let i = 1; i < mid.length; i++) {
    if (age <= mid[i]) {
      const u = (age - mid[i - 1]) / (mid[i] - mid[i - 1]);
      return col(i - 1) + (col(i) - col(i - 1)) * u;
    }
  }
  return col(mid.length - 1);
}

// --- transfers ------------------------------------------------------------

const ages = DATA.transferAges.map((s) => s.split('-').map(Number));

function pickIndex(weights, rand) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rand() * total;
  for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) < 0) return i;
  return weights.length - 1;
}

// Per kind: how often a household receives one, who by age and wealth
// quintile, and what it is worth.
export const KINDS = {
  gift: {
    perHousehold: DATA.giftsPerYear / DATA.households,
    ageShare: DATA.giftShareByAge,
    ageAvg: DATA.giftAvgByAge,
    recvShare: DATA.giftRecvShareByQuintile,
    recvAvg: DATA.giftRecvAvgByQuintile,
  },
  inheritance: {
    perHousehold: DATA.inheritancesPerYear / DATA.households,
    ageShare: DATA.inheritanceShareByAge,
    ageAvg: DATA.inheritanceAvgByAge,
    recvShare: DATA.inheritanceRecvShareByQuintile,
    recvAvg: DATA.inheritanceRecvAvgByQuintile,
  },
};

for (const k of Object.values(KINDS)) {
  // Quintile of a recipient: ∝ the share of each quintile who received one.
  const t = k.recvShare.reduce((a, b) => a + b, 0);
  k.quintileWeight = k.recvShare.map((s) => s / t);
  // Quintile amounts as a factor on the age average, mean 1 over recipients.
  const mean = k.recvAvg.reduce((a, v, q) => a + v * k.quintileWeight[q], 0);
  k.quintileFactor = k.recvAvg.map((v) => v / mean);
  k.meanAmount = k.ageShare.reduce((a, s, i) => a + s * k.ageAvg[i], 0)
    / k.ageShare.reduce((a, b) => a + b, 0);
}

// One transfer: who gets it, at what age, how much, and who gives it.
export function drawTransfer(kind, rand) {
  const k = KINDS[kind];
  const band = pickIndex(k.ageShare, rand);
  const [lo, hi] = ages[band];
  const age = Math.min(AGE_MAX - 1, Math.max(AGE_MIN, lo + rand() * (hi + 1 - lo)));
  const q = pickIndex(k.quintileWeight, rand);
  const row = 2 * q + (rand() < 0.5 ? 0 : 1);
  const amount = k.ageAvg[band] * k.quintileFactor[q];
  const fromAge = Math.min(AGE_MAX - 1, age + GENERATION_GAP);
  // Each row is a line of families: the parent is in the child's row.
  return { kind, age, row, amount, fromAge, fromRow: row };
}

// The squeeze, an assumption: a parent facing `shock` dollars of extra costs
// a year gives a gift only out of cash beyond that, scaled by
// 1 − shock / (their quintile's average cash in the bank). Inheritances are
// left alone: an estate passes on whatever the squeeze.
export function giftFactor(fromRow, shock) {
  const cash = DATA.cashByQuintile[quintileOf(fromRow)];
  return Math.max(0, 1 - shock / cash);
}

// Expected dollars passed back per household per year by parents in each
// row, for a shock: the gauge. A row gives what it receives.
export function expectedGivenByRow(shock) {
  return Array.from({ length: ROWS }, (_, row) => {
    const q = quintileOf(row);
    const out = {};
    for (const [name, k] of Object.entries(KINDS)) {
      // This row's share of all transfers, over its 10% of households.
      let value = (k.perHousehold * k.quintileWeight[q] / 2) * ROWS * k.meanAmount * k.quintileFactor[q];
      if (name === 'gift') value *= giftFactor(row, shock);
      out[name] = value;
    }
    return out;
  });
}

export function money(x) {
  const s = x < 0 ? '−' : '';
  x = Math.abs(x);
  if (x >= 1e6) return `${s}$${(x / 1e6).toFixed(x >= 1e7 ? 0 : 1)}M`;
  if (x >= 1e4) return `${s}$${Math.round(x / 1e3)}k`;
  if (x >= 1e3) return `${s}$${(x / 1e3).toFixed(1)}k`;
  return `${s}$${Math.round(x)}`;
}
