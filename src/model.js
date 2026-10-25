// The housing model: one deterministic life per row.
//
// A row is an income decile among households of the same age. Its household
// earns that decile's ABS disposable income at each age (2019-20 dollars),
// rents and saves until it can buy the house, repays the mortgage with a
// fixed share of income, and once the house is paid off gives a share of
// income to its child: the household in the same row GAP years younger, until
// the child has paid off their own house. Rows are lines of families, and
// every generation lives the same life (a steady state), so a row's parent
// is the row itself, GAP years on. The constants are assumptions, named in
// data/SOURCES.md; SAVE_RATE and HOUSING_SHARE are calibrated to ABS home
// ownership by age, and GIVE_SHARE to the PC's gifts from parents
// (scripts/calibrate.mjs, data/CALIBRATION.md).

import { DATA } from './data.generated.js';
import { CALIBRATION } from './calibration.generated.js';

export const AGE_MIN = 20;
export const AGE_MAX = 90;
export const YEARS = AGE_MAX - AGE_MIN; // ages 20..89
export const ROWS = 10;

export const HOUSING_SHARE = CALIBRATION.housingShare; // of income, to the mortgage
export const DEPOSIT = 0.2; // of the price, saved before buying (default)
export const LOAN_TERM = 30; // years: a loan must be repayable in this at HOUSING_SHARE
export const GAP = 25; // years between a parent and the child they help
export const RATE = DATA.realRate;
export const SAVE_RATE = CALIBRATION.saveRate;
export const GIVE_SHARE = CALIBRATION.giveShare; // of income, to the child once owned

export const RENT = 0, MORTGAGE = 1, OWNED = 2;

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

// The yearly repayment that clears `loan` in `years` at `rate`.
export function annuity(loan, rate = RATE, years = LOAN_TERM) {
  if (loan <= 0) return 0;
  return rate === 0 ? loan / years : (loan * rate) / (1 - Math.pow(1 + rate, -years));
}

// One life, given what the parent gives at each of the child's ages.
// `parentGives(i)` is the gift at age AGE_MIN + i, paid only while this
// household has not yet paid off its own house.
function live(row, price, parentGives, opts) {
  const { saveRate = SAVE_RATE, share = HOUSING_SHARE, giveShare = GIVE_SHARE, deposit = DEPOSIT } = opts;
  const life = {
    row, income: [], state: [], wealth: [], debt: [], received: [], gives: [],
    buyAge: null, ownAge: null,
  };
  let savings = 0, debt = 0, state = RENT;
  for (let i = 0; i < YEARS; i++) {
    const age = AGE_MIN + i;
    const y = incomeAt(row, age + 0.5);
    const gift = state === OWNED ? 0 : parentGives(i);
    if (state === RENT) {
      savings += saveRate * y + gift;
      const loan = Math.max(0, price - savings);
      if (savings >= deposit * price && annuity(loan) <= share * y) {
        state = MORTGAGE;
        debt = loan;
        savings = Math.max(0, savings - price);
        life.buyAge = age;
      }
    } else if (state === MORTGAGE) {
      savings += saveRate * y;
      debt = debt * (1 + RATE) - share * y - gift;
      if (debt <= 0) {
        savings -= debt;
        debt = 0;
        state = OWNED;
        life.ownAge = age;
      }
    } else {
      savings += saveRate * y;
    }
    life.income.push(y);
    life.state.push(state);
    life.debt.push(debt);
    life.received.push(gift);
    life.wealth.push(savings + (state === RENT ? 0 : price - debt));
    // Owned outright: part of what went to the mortgage now goes to the child.
    life.gives.push(state === OWNED ? giveShare * y : 0);
  }
  return life;
}

// A row's steady state: the parent is this same life, GAP years older.
export function lifeOf(row, price, opts = {}) {
  let life = live(row, price, () => 0, opts);
  for (let iter = 0; iter < 30; iter++) {
    const parent = life;
    const next = live(row, price, (i) => (i + GAP < YEARS ? parent.gives[i + GAP] : 0), opts);
    const same = next.ownAge === life.ownAge && next.buyAge === life.buyAge;
    life = next;
    if (same) break;
  }
  return life;
}

export function model(price, opts = {}) {
  return Array.from({ length: ROWS }, (_, row) => lifeOf(row, price, opts));
}

// Share of households owning (any) and owning outright in each ABS age band.
export const BAND_AGES = [[20, 24], [25, 34], [35, 44], [45, 54], [55, 64], [65, 74], [75, 89]];

export function tenureByBand(lives) {
  return BAND_AGES.map(([lo, hi]) => {
    let own = 0, outright = 0, n = 0;
    for (const life of lives) {
      for (let age = lo; age <= hi; age++) {
        const s = life.state[age - AGE_MIN];
        own += s !== RENT;
        outright += s === OWNED;
        n++;
      }
    }
    return { own: own / n, outright: outright / n };
  });
}
