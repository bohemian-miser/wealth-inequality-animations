// The housing model: households living through history, one calendar year
// at a time.
//
// A row is an income decile among households of the same age; a household
// earns that decile's ABS 2019-20 disposable income at each age, all its
// life. Households in a row are born SPACING years apart; each one's parent
// is the household GAP years older in the same row. Every household:
//   - rents and saves until it can buy the house at this year's price,
//   - repays a 30-year mortgage in fixed (real) yearly repayments, and may
//     only borrow what those repayments on a share of its income can clear,
//   - once it owns outright, gives a share of income to its child until the
//     child owns outright too,
//   - from 65 spends its savings down, and
//   - at 90 dies: the estate (the house at this year's price, plus what's
//     left) goes to its child; a child who already owns outright passes it
//     on to their own child (the grandchild) if they still need it.
// House prices follow the OECD price-to-income ratio at 2019-20 incomes
// (flat at the first year's level before it, held at the last after it), so
// an owner's house rises in value with the market. The constants are named
// in data/SOURCES.md; the shares are calibrated (scripts/calibrate.mjs).

import { DATA } from './data.generated.js';
import { CALIBRATION } from './calibration.generated.js';

export const AGE_MIN = 20;
export const AGE_MAX = 90;
export const RETIRE = 65;
export const ROWS = 10;
export const GAP = 25; // years between a parent and their child
export const SPACING = 2.5; // years between neighbouring households in a row
export const PER_ROW = (AGE_MAX - AGE_MIN) / SPACING; // households alive in a row
export const DEPOSIT = 0.2;
export const LOAN_TERM = 30;
export const RATE = DATA.realRate;

const priceYears = Object.keys(DATA.priceByYear).map(Number);
export const FIRST_PRICE_YEAR = Math.min(...priceYears);
export const LAST_PRICE_YEAR = Math.max(...priceYears);
export const START = FIRST_PRICE_YEAR - 110; // warm-up: everyone alive in 1970 has a past
export const SHOW_FROM = FIRST_PRICE_YEAR;
export const END = 2070;

export const RENT = 0, MORTGAGE = 1, OWNED = 2;

export function priceAt(year) {
  const y = Math.min(LAST_PRICE_YEAR, Math.max(FIRST_PRICE_YEAR, Math.floor(year)));
  return DATA.priceByYear[y];
}

// Household disposable income a year for decile `row` at `age`, linear
// between the ABS age bands' midpoints.
export function incomeAt(row, age) {
  const mid = DATA.ageMid;
  const col = (i) => DATA.incomeDeciles[i][row];
  if (age <= mid[0]) return col(0);
  for (let i = 1; i < mid.length; i++) {
    if (age <= mid[i]) {
      const u = (age - mid[i - 1]) / (mid[i] - mid[i - 1]);
      return col(i - 1) + (col(i) - col(i - 1)) * u;
    }
  }
  return col(mid.length - 1);
}

export function annuity(loan, rate = RATE, years = LOAN_TERM) {
  if (loan <= 0) return 0;
  return rate === 0 ? loan / years : (loan * rate) / (1 - Math.pow(1 + rate, -years));
}

// ABS age bands (15–24 starts at 20 here; 75+ runs to 90).
export const BANDS = [[20, 25], [25, 35], [35, 45], [45, 55], [55, 65], [65, 75], [75, 90]];

// Run history. Returns every household's state and wealth by year, the
// gifts and bequests, and yearly statistics.
export function simulate(opts = {}) {
  const {
    saveRate = CALIBRATION.saveRate,
    share = CALIBRATION.housingShare,
    giveShare = CALIBRATION.giveShare,
  } = opts;
  const nYears = END - START + 1;
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const hs = [];
    // Rows are staggered a fraction of SPACING apart so they don't move in lockstep.
    for (let born = START - AGE_MAX + (r * SPACING) / ROWS; born <= END - AGE_MIN; born += SPACING) {
      hs.push({
        row: r, born, savings: 0, debt: 0, payment: 0, state: RENT,
        st: new Int8Array(nYears).fill(-1), wealth: new Float32Array(nYears),
      });
    }
    rows.push(hs);
  }
  const step = GAP / SPACING; // index offset from a household to its child
  const gifts = []; // { year, row, from, to, amount }
  const bequests = []; // { year, row, from, to, amount, via }
  const stats = [];

  // An inheritance lands. One who already owns outright passes it to their
  // own child if that child still needs it.
  function windfall(h, i, amount, row, year, from, via) {
    if (h.state === OWNED) {
      const kid = rows[row][i + step];
      if (kid && kid.state !== OWNED && year - kid.born >= AGE_MIN) {
        windfall(kid, i + step, amount, row, year, from, h);
        return;
      }
      h.savings += amount;
    } else if (h.state === MORTGAGE) {
      h.debt -= amount;
      if (h.debt <= 0) { h.savings -= h.debt; h.debt = 0; h.state = OWNED; }
    } else {
      h.savings += amount;
    }
    bequests.push({ year, row, from, to: h, amount, via });
  }

  for (let year = START; year <= END; year++) {
    const yi = year - START;
    const P = priceAt(year);
    for (let r = 0; r < ROWS; r++) {
      const hs = rows[r];
      // Deaths first, so the estate is there when the children step.
      for (let i = 0; i < hs.length; i++) {
        const h = hs[i];
        const age = year - h.born;
        if (age < AGE_MAX || age >= AGE_MAX + 1) continue;
        const estate = Math.max(0, h.savings + (h.state === RENT ? 0 : P - h.debt));
        h.savings = 0; h.debt = 0;
        const kid = hs[i + step];
        if (kid && estate > 0) windfall(kid, i + step, estate, r, year, h, null);
      }
      for (let i = 0; i < hs.length; i++) {
        const h = hs[i];
        const age = year - h.born;
        if (age < AGE_MIN || age >= AGE_MAX) continue;
        const y = incomeAt(r, age);
        const parent = hs[i - step];
        let gift = 0;
        if (parent && parent.state === OWNED && h.state !== OWNED && year - parent.born < AGE_MAX) {
          gift = giveShare * incomeAt(r, year - parent.born);
          gifts.push({ year, row: r, from: parent, to: h, amount: gift });
        }
        const saving = age < RETIRE ? saveRate * y : 0;
        if (age >= RETIRE) h.savings -= h.savings / Math.max(1, AGE_MAX - age);
        if (h.state === RENT) {
          h.savings += saving + gift;
          const loan = Math.max(0, P - h.savings);
          if (h.savings >= DEPOSIT * P && annuity(loan) <= share * y) {
            h.savings = Math.max(0, h.savings - P);
            h.debt = loan;
            h.payment = annuity(loan);
            h.state = loan > 0 ? MORTGAGE : OWNED;
          }
        } else if (h.state === MORTGAGE) {
          h.savings += saving;
          h.debt = h.debt * (1 + RATE) - h.payment - gift;
          if (h.debt <= 0) { h.savings -= h.debt; h.debt = 0; h.state = OWNED; }
        } else {
          h.savings += saving;
        }
        h.st[yi] = h.state;
        h.wealth[yi] = h.savings + (h.state === RENT ? 0 : P - h.debt);
      }
    }
    stats.push(yearStats(rows, year, yi, P));
  }
  for (const g of gifts) stats[g.year - START].gifts += g.amount;
  for (const b of bequests) stats[b.year - START].bequests += b.amount;
  return { rows, gifts, bequests, stats, households: ROWS * PER_ROW };
}

function yearStats(rows, year, yi, P) {
  const s = { year, price: P, own: [], outright: [], homes: 0, homesOld: 0, young: 0, youngOwn: 0, gifts: 0, bequests: 0 };
  const n = BANDS.map(() => [0, 0, 0]);
  for (const hs of rows) {
    for (const h of hs) {
      const st = h.st[yi];
      if (st < 0) continue;
      const age = year - h.born;
      const b = BANDS.findIndex(([lo, hi]) => age >= lo && age < hi);
      n[b][0]++; n[b][1] += st !== RENT; n[b][2] += st === OWNED;
      if (st !== RENT) { s.homes++; if (age >= RETIRE) s.homesOld++; }
      if (age < 40) { s.young++; s.youngOwn += st !== RENT; }
    }
  }
  s.own = n.map(([t, o]) => o / t);
  s.outright = n.map(([t, , o]) => o / t);
  return s;
}
