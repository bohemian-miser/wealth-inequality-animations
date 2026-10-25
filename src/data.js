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

// --- normal distribution helpers ----------------------------------------

export function phi(z) {
  // Abramowitz & Stegun 7.1.26 via erf.
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
    * Math.exp(-z * z / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function phiInv(p) {
  // Acklam's rational approximation.
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -phiInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

function randn(rand) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
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

// Rank-rank persistence between a parent's and child's wealth at the
// child's age (PC figure 2.10, Siminski & Yu 2021).
export function persistence(age) {
  const p = DATA.persistenceByAge;
  if (age <= p[0][0]) return p[0][1];
  for (const [a, v] of p) if (age <= a) return v;
  return p[p.length - 1][1];
}

// A parent's wealth decile given their child's, through a Gaussian copula
// whose rank correlation is that persistence.
export function parentRow(childRow, childAge, rand) {
  const rs = persistence(childAge);
  const rho = 2 * Math.sin((Math.PI * rs) / 6);
  const zc = phiInv((childRow + 0.05 + 0.9 * rand()) / ROWS);
  const zp = rho * zc + Math.sqrt(1 - rho * rho) * randn(rand);
  return Math.min(ROWS - 1, Math.floor(phi(zp) * ROWS));
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
  const fromRow = parentRow(row, age, rand);
  return { kind, age, row, amount, fromAge, fromRow };
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
// row, for a shock: the gauge. Which rows parents are in is not measured
// directly; it follows from the recipients' quintiles and the persistence
// copula, so the joint (child row, parent row) mix is sampled once.
function jointMix(k) {
  let seed = 12345;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mix = Array.from({ length: ROWS }, () => new Array(ROWS).fill(0));
  const n = 4000;
  for (let row = 0; row < ROWS; row++) {
    const pRow = k.quintileWeight[quintileOf(row)] / 2;
    for (let i = 0; i < n; i++) {
      const band = pickIndex(k.ageShare, rand);
      const [lo, hi] = ages[band];
      mix[row][parentRow(row, lo + rand() * (hi + 1 - lo), rand)] += pRow / n;
    }
  }
  return mix;
}
for (const k of Object.values(KINDS)) k.joint = jointMix(k);

export function expectedGivenByRow(shock) {
  return Array.from({ length: ROWS }, (_, pr) => {
    const out = {};
    for (const [name, k] of Object.entries(KINDS)) {
      let value = 0;
      for (let cr = 0; cr < ROWS; cr++) {
        value += k.joint[cr][pr] * k.meanAmount * k.quintileFactor[quintileOf(cr)];
      }
      // All transfers a year per household, over this row's 10% of households.
      value *= k.perHousehold * ROWS;
      if (name === 'gift') value *= giftFactor(pr, shock);
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
