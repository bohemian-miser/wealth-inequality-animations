// The housing model: households living through history, one calendar year
// at a time.
//
// A row is a lifetime-income decile: households who stay in roughly the same
// place in the income distribution all their lives. Their income at each age
// comes from ABS 2019-20 disposable incomes by age, pulled towards the age's
// middle by INCOME_SPREAD (one year's income is far more spread out than a
// lifetime's). Households in a row are born SPACING years apart; each one's
// parent is the household GAP years older in the same row. Each household
// also has its own:
//   - house price: where it buys, a factor around the mean dwelling price;
//   - age at death, spread like real deaths after 65 (capped at 90).
// Every year, every household:
//   - rents and saves (before 65, out of income above a floor) until it can
//     buy a starter home (STARTER of its house price) with a 10% deposit and a 30-year loan whose first
//     year's repayments, at that year's nominal rate, fit within the lending
//     limit (a share of its income);
//   - from TRADE_UP_AFTER years on (and before 65), trades up to its full
//     house price in the first year a new 20-year loan passes that test (a
//     cash buyer buys it straight away);
//   - repays a variable-rate loan: each year's repayment clears it over the
//     years left at that year's rate, and inflation wears the debt down;
//   - once it owns outright, gives a share of its wealth each year to its
//     child until the child owns outright too; and
//   - from 65 spends its savings down; at death its estate (its home at this
//     year's price, plus what's left, less debt) goes to its child.
// Gifts and estates go into savings: they can make a deposit, but a mortgage
// runs its course. House prices follow the OECD price-to-income ratio at
// 2019-20 incomes (flat at the first year's level before it, held at the last
// after it), so an owner's home rises in value with the market. The constants
// are named in data/SOURCES.md; the calibrated ones come from
// scripts/calibrate.mjs.

import { DATA } from './data.generated.js';
import { CALIBRATION } from './calibration.generated.js';

export const AGE_MIN = 20;
export const AGE_MAX = 95; // the grid ends here; a household still alive then dies at it
export const RETIRE = 65;
export const ROWS = 10;
export const GAP = 30; // years between a parent and their child
export const SPACING = 1.25; // years between neighbouring households in a row
export const DEPOSIT = 0.2; // for a trade-up
export const FIRST_DEPOSIT = 0.1; // for a first home (with lenders' mortgage insurance)
export const STARTER = 0.7; // a first home's price, as a share of the household's house price
export const TRADE_UP_AFTER = 10; // years before trading up
export const LOAN_TERM = 30;
export const LAST_LOAN_AGE = 75; // lenders want a loan repaid by about this age
export const MIN_TERM = 5;
export const HEIR_SHARE = 0.5; // an estate splits between two children; one is in the row
// Mortgage rates by year (RBA rates actually paid; real = less that year's
// CPI inflation). Before the series, its first year; after it, the averages
// from 1990 (a what-if).
const rateYears = Object.keys(DATA.realRateByYear).map(Number);
const FIRST_RATE_YEAR = Math.min(...rateYears), LAST_RATE_YEAR = Math.max(...rateYears);
const avgFrom1990 = (o) => { const v = Object.entries(o).filter(([y]) => +y >= 1990).map(([, x]) => x); return v.reduce((a, b) => a + b, 0) / v.length; };
const LATER = { real: avgFrom1990(DATA.realRateByYear), nominal: avgFrom1990(DATA.nominalRateByYear) };
export function ratesAt(year) {
  const y = Math.floor(year);
  if (y > LAST_RATE_YEAR) return LATER;
  const k = Math.max(FIRST_RATE_YEAR, y);
  return { real: DATA.realRateByYear[k], nominal: DATA.nominalRateByYear[k] };
}

export const DEFAULTS = {
  saveRate: 0.15, // of income above the floor
  saveFloor: 40000, // income a household needs before it can save
  housingShare: 0.3,
  housingSharePre1986: 0.3, // before financial deregulation, credit was rationed
  giveRate: 0.05, // of the parent's wealth, given once as help to buy
  incomeSpread: 1, // 1 = one year's income spread; smaller = lifetime
  incomeNoise: 0, // sd of log income factor within a row (one or two earners, careers)
  youngIncome: 1, // income at 20 as a share of the row's, rising to 1 by 30
  priceSpread: 0, // sd of log house price factor
  ...CALIBRATION,
};

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

// Household incomes by row and age band, with each band's deciles pulled
// towards its middle (in logs) by `spread`, then rescaled to keep the band's
// mean.
function incomeTable(spread) {
  return DATA.incomeDeciles.map((band) => {
    const mid = Math.sqrt(band[4] * band[5]);
    const pulled = band.map((y) => mid * Math.pow(y / mid, spread));
    const k = band.reduce((a, b) => a + b, 0) / pulled.reduce((a, b) => a + b, 0);
    return pulled.map((y) => y * k);
  });
}

// Household disposable income a year for row `row` at `age`, linear between
// the ABS age bands' midpoints.
export function incomeAt(row, age, table = incomeTable(DEFAULTS.incomeSpread)) {
  const mid = DATA.ageMid;
  const col = (i) => table[i][row];
  if (age <= mid[0]) return col(0);
  for (let i = 1; i < mid.length; i++) {
    if (age <= mid[i]) {
      const u = (age - mid[i - 1]) / (mid[i] - mid[i - 1]);
      return col(i - 1) + (col(i) - col(i - 1)) * u;
    }
  }
  return col(mid.length - 1);
}

export function annuity(loan, rate, years = LOAN_TERM) {
  if (loan <= 0) return 0;
  return rate === 0 ? loan / years : (loan * rate) / (1 - Math.pow(1 + rate, -years));
}

// Acklam's inverse normal.
function phiInv(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - 0.02425) return -phiInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// Deterministic, well-spread draws in (0, 1) for household k of row r.
const draw = (k, r, salt) => {
  const x = k * 0.7548776662466927 + r * 0.5698402909980532 + salt * 0.3141592653589793;
  return 0.005 + 0.99 * (x - Math.floor(x));
};

// Age at death for a household, from the quantiles of age at death after 65
// (data/SOURCES.md), capped at AGE_MAX.
export function deathAgeFor(u) {
  const q = DATA.deathAgeQuantiles; // ages at 0%, 10%, …, 100%
  const i = Math.min(q.length - 2, Math.floor(u * (q.length - 1)));
  const f = u * (q.length - 1) - i;
  return Math.min(AGE_MAX, q[i] + (q[i + 1] - q[i]) * f);
}

// ABS age bands (15–24 starts at 20 here; 75+ runs to 95).
export const BANDS = [[20, 25], [25, 35], [35, 45], [45, 55], [55, 65], [65, 75], [75, 95]];

// Run history. Returns every household's state and wealth by year, the
// gifts, bequests, purchases and payoffs, and yearly statistics.
export function simulate(opts = {}) {
  const p = { ...DEFAULTS, ...opts };
  const table = incomeTable(p.incomeSpread);
  const income = (r, age) => incomeAt(r, age, table);
  const nYears = END - START + 1;
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const hs = [];
    let k = 0;
    // Rows are staggered a fraction of SPACING apart so they don't move in lockstep.
    for (let born = START - AGE_MAX + (r * SPACING) / ROWS; born <= END - AGE_MIN; born += SPACING, k++) {
      const z = phiInv(draw(k, r, 2)), zi = phiInv(draw(k, r, 3));
      hs.push({
        row: r, born, savings: 0, debt: 0, term: 0, state: RENT, home: 0, homeSince: null, died: null,
        helped: false,
        deathAge: deathAgeFor(draw(k, r, 1)),
        priceFactor: Math.exp(p.priceSpread * z - (p.priceSpread * p.priceSpread) / 2),
        incomeFactor: Math.exp(p.incomeNoise * zi - (p.incomeNoise * p.incomeNoise) / 2),
        st: new Int8Array(nYears).fill(-1), wealth: new Float32Array(nYears),
      });
    }
    rows.push(hs);
  }
  const step = GAP / SPACING; // index offset from a household to its child
  const gifts = []; // { year, row, from, to, amount }
  const bequests = []; // { year, row, from, to, amount }
  const buys = []; // { year, row, age, kind: 'starter' | 'trade-up', cash }
  const payoffs = []; // { year, row, age }
  const stats = [];
  const alive = (h, year) => h && year - h.born >= AGE_MIN && year - h.born < h.deathAge;

  for (let year = START; year <= END; year++) {
    const yi = year - START;
    const P = priceAt(year);
    const R = ratesAt(year);
    for (let r = 0; r < ROWS; r++) {
      const hs = rows[r];
      // Deaths first, so the estate is there when the heir steps.
      for (let i = 0; i < hs.length; i++) {
        const h = hs[i];
        const age = year - h.born;
        if (h.died !== null || age < h.deathAge) continue;
        if (age < AGE_MIN) continue;
        h.died = year;
        const estate = Math.max(0, h.savings + h.home * P - h.debt) * HEIR_SHARE;
        h.savings = 0; h.debt = 0; h.home = 0;
        const kid = hs[i + step];
        if (!alive(kid, year) || estate <= 0) continue;
        kid.savings += estate;
        bequests.push({ year, row: r, from: h, to: kid, amount: estate });
      }
      for (let i = 0; i < hs.length; i++) {
        const h = hs[i];
        if (!alive(h, year)) continue;
        const age = year - h.born;
        const young = age < 30 ? p.youngIncome + ((1 - p.youngIncome) * (age - AGE_MIN)) / 10 : 1;
        const y = income(r, age) * h.incomeFactor * young;
        if (age < RETIRE) h.savings += p.saveRate * Math.max(0, y - p.saveFloor);
        else h.savings -= h.savings / Math.max(1, AGE_MAX - age);

        const own = h.priceFactor * P; // this household's house, at this year's prices
        // The bank's test: the first year's repayments, at this year's nominal
        // rate, within the lending limit; and the loan repaid by LAST_LOAN_AGE.
        const termFor = (max) => Math.min(max, Math.floor(LAST_LOAN_AGE - age));
        const limit = year < 1986 ? p.housingSharePre1986 : p.housingShare;
        const fits = (loan, term) => loan <= 0 || (term >= MIN_TERM && annuity(loan, R.nominal, term) <= limit * y);
        if (h.state === RENT) {
          // First home: a starter; a household that can pay cash for its full
          // house buys that.
          const canBuy = (savings) => {
            const size = savings >= own ? 1 : STARTER;
            const price = size * own;
            const loan = Math.max(0, price - savings);
            return savings >= FIRST_DEPOSIT * price && fits(loan, termFor(LOAN_TERM)) ? { size, price, loan } : null;
          };
          let buy = canBuy(h.savings);
          // Help to buy: a parent who owns outright gives a share of its
          // wealth once, when that is what makes the purchase possible.
          const parent = hs[i - step];
          if (!buy && !h.helped && age < 45 && parent && parent.state === OWNED && alive(parent, year)) {
            const gift = p.giveRate * Math.max(0, parent.savings + parent.home * P);
            if (gift > 0 && canBuy(h.savings + gift)) {
              h.savings += gift; h.helped = true;
              gifts.push({ year, row: r, from: parent, to: h, amount: gift });
              buy = canBuy(h.savings);
            }
          }
          if (buy) {
            const { size, price, loan } = buy;
            h.savings = Math.max(0, h.savings - price);
            h.debt = loan; h.term = termFor(LOAN_TERM);
            h.home = size * h.priceFactor; h.homeSince = year;
            h.state = loan > 0 ? MORTGAGE : OWNED;
            buys.push({ year, row: r, age, kind: 'starter', cash: loan === 0 });
          }
        } else if (h.home < h.priceFactor && year - h.homeSince >= TRADE_UP_AFTER && age < RETIRE) {
          // Trade up, from TRADE_UP_AFTER years on, in the first year the bank
          // test passes: sell the starter, roll what's owed plus the gap into
          // one new 20-year loan.
          const gap = (h.priceFactor - h.home) * P;
          const fromSavings = Math.min(h.savings, gap);
          const loan = h.debt + gap - fromSavings;
          const term = termFor(LOAN_TERM - TRADE_UP_AFTER);
          if (fits(loan, term)) {
            h.savings -= fromSavings;
            h.debt = loan; h.term = term;
            h.home = h.priceFactor; h.homeSince = year;
            h.state = loan > 0 ? MORTGAGE : OWNED;
            buys.push({ year, row: r, age, kind: 'trade-up', cash: loan === 0 });
          }
        }
        if (h.state === MORTGAGE && h.homeSince !== year) {
          // A variable-rate loan: this year's repayment clears the debt over
          // the years left at this year's nominal rate; in today's dollars the
          // debt grows at the real rate, so inflation wears it down.
          const pay = annuity(h.debt, R.nominal, h.term);
          h.debt = h.debt * (1 + R.real) - pay;
          h.term -= 1;
          if (h.debt <= 1 || h.term <= 0) {
            h.savings -= Math.max(0, h.debt); h.debt = 0; h.state = OWNED;
            payoffs.push({ year, row: r, age });
          }
        }
        h.st[yi] = h.state;
        h.wealth[yi] = h.savings + h.home * P - h.debt;
      }
    }
    stats.push(yearStats(rows, year, yi, P));
  }
  for (const g of gifts) stats[g.year - START].gifts += g.amount;
  for (const b of bequests) stats[b.year - START].bequests += b.amount;
  return { rows, gifts, bequests, buys, payoffs, stats, income, params: p };
}

// The model has the same number of households born every year; Australia
// doesn't. Statistics weight each household by its age group's share of the
// real adult population that year (ABS), over its share in the model.
function popWeights(rows, year, yi) {
  const groups = DATA.popGroups;
  const years = Object.keys(DATA.popShareByYear).map(Number);
  const real = DATA.popShareByYear[Math.min(Math.max(...years), Math.max(Math.min(...years), year))];
  const count = groups.map(() => 0);
  let total = 0;
  for (const hs of rows) for (const h of hs) {
    if (h.st[yi] < 0) continue;
    const g = groups.findIndex(([lo, hi]) => year - h.born >= lo && year - h.born < hi);
    if (g >= 0) { count[g]++; total++; }
  }
  return count.map((c, g) => (c ? real[g] / (c / total) : 0));
}
const groupOf = (age) => DATA.popGroups.findIndex(([lo, hi]) => age >= lo && age < hi);

function yearStats(rows, year, yi, P) {
  const s = {
    year, price: P, own: [], outright: [], n: 0, homes: 0, homesOld: 0, young: 0, youngOwn: 0,
    gifts: 0, bequests: 0,
  };
  const w = popWeights(rows, year, yi);
  const n = BANDS.map(() => [0, 0, 0]);
  for (const hs of rows) {
    for (const h of hs) {
      const st = h.st[yi];
      if (st < 0) continue;
      s.n++;
      const age = year - h.born;
      const b = BANDS.findIndex(([lo, hi]) => age >= lo && age < hi);
      n[b][0]++; n[b][1] += st !== RENT; n[b][2] += st === OWNED;
      const wt = w[groupOf(age)] ?? 0;
      if (st !== RENT) { s.homes += wt; if (age >= RETIRE) s.homesOld += wt; }
      if (age >= 25 && age < 40) { s.young += wt; s.youngOwn += (st !== RENT) * wt; } // Census's 25–39
    }
  }
  s.own = n.map(([t, o]) => (t ? o / t : 0));
  s.outright = n.map(([t, , o]) => (t ? o / t : 0));
  return s;
}
