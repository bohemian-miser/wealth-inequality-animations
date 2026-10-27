// Calibrate the housing model (src/model.js) against history.
//
//   node scripts/calibrate.mjs   → src/calibration.generated.js, data/CALIBRATION.md
//
// Fitted together (Nelder–Mead), each target group weighted equally:
//   - Census home ownership by age, 1981–2021 (AIHW);
//   - ABS 2019-20 tenure by age (renting, mortgaged, owned outright);
//   - ABS older owners' tenure, 45–54 and 55–64, 1997-98 to 2019-20;
//   - ABS 2019-20 tenure by income quintile.
// Free: saveRate and saveFloor (saving out of income above a floor),
// housingShare (the lending limit), incomeSpread (how much a
// lifetime's income is spread compared with one year's), priceSpread (how
// much households' house prices vary), and more (see SPACE). Help to buy is
// fixed at a share of the parent's wealth with a fitted cap.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA } from '../src/data.generated.js';
import { simulate, START, BANDS, RENT, MORTGAGE, OWNED } from '../src/model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GIFT_TARGET = DATA.giftFromParentsValue / DATA.households;
const CENSUS_YEARS = [1971, 1976, 1981, 1986, 1991, 1996, 2001, 2006, 2011, 2016, 2021];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// --- what the model says --------------------------------------------------

function alive(sim, year) {
  const out = [];
  for (const hs of sim.rows) for (const h of hs) {
    const st = h.st[year - START];
    if (st >= 0) out.push({ h, st, age: year - h.born });
  }
  return out;
}
const shareOf = (hs, test) => (hs.length ? hs.filter(test).length / hs.length : 0);
const inAges = (hs, lo, hi) => hs.filter((x) => x.age >= lo && x.age < hi);

function measure(sim) {
  const m = {};
  // Census: owners by 5-year age group.
  m.census = {};
  for (const g of Object.keys(DATA.censusOwnByAge)) {
    const [lo, hi] = g.split('–').map(Number);
    m.census[g] = {};
    for (const y of CENSUS_YEARS) m.census[g][y] = shareOf(inAges(alive(sim, y), lo, hi + 1), (x) => x.st !== RENT);
  }
  // SIH 2019-20 tenure by age: the average of the model's 2019 and 2020.
  m.sih = BANDS.map(([lo, hi]) => {
    const hs = [2019, 2020].flatMap((y) => inAges(alive(sim, y), lo, hi));
    return {
      rent: shareOf(hs, (x) => x.st === RENT),
      mortgage: shareOf(hs, (x) => x.st === MORTGAGE),
      outright: shareOf(hs, (x) => x.st === OWNED),
    };
  });
  // Older owners over time.
  m.older = DATA.olderMortgage.map((o) => {
    const hs = alive(sim, o.year);
    const a = inAges(hs, 45, 55), b = inAges(hs, 55, 65);
    return {
      year: o.year,
      age_45_54_outright: shareOf(a, (x) => x.st === OWNED), age_45_54_mortgage: shareOf(a, (x) => x.st === MORTGAGE),
      age_55_64_outright: shareOf(b, (x) => x.st === OWNED), age_55_64_mortgage: shareOf(b, (x) => x.st === MORTGAGE),
    };
  });
  // Tenure by current-income quintile, 2020.
  const hs = alive(sim, 2020).map((x) => ({ ...x, y: sim.income(x.h.row, x.age) })).sort((p, q) => p.y - q.y);
  m.quintiles = [0, 1, 2, 3, 4].map((q) => {
    const part = hs.slice(Math.floor((q * hs.length) / 5), Math.floor(((q + 1) * hs.length) / 5));
    return {
      outright: shareOf(part, (x) => x.st === OWNED),
      mortgage: shareOf(part, (x) => x.st === MORTGAGE),
      renting: shareOf(part, (x) => x.st === RENT),
    };
  });
  // Mean age at first purchase with a mortgage, by period.
  m.firstBuyAge = FIRST_BUY_AGE.map(([a, b]) => {
    const fb = sim.buys.filter((e) => e.kind === 'starter' && !e.cash && e.year >= a && e.year <= b);
    return fb.length ? mean(fb.map((e) => e.age)) : 99;
  });
  return m;
}

// ABS Housing Occupancy and Costs: first home buyers' average age was 32–33
// in every survey from 1995-96 to 2011-12, 34 in 2015-16 (ABS 4130.0 feature
// "Across the Generations") and 35–36 in 2017-18 (as reported by AHURI).
const FIRST_BUY_AGE = [[1996, 2012, 32.5], [2015, 2018, 34.8]];

function loss(m) {
  const groups = [];
  const c = [];
  for (const g of Object.keys(DATA.censusOwnByAge)) for (const y of CENSUS_YEARS) c.push((m.census[g][y] - DATA.censusOwnByAge[g][y]) ** 2);
  groups.push(mean(c));
  const s = [];
  m.sih.forEach((x, b) => {
    const own = DATA.outrightByAge[b] + DATA.mortgagedByAge[b];
    s.push((x.rent - (1 - own)) ** 2, (x.mortgage - DATA.mortgagedByAge[b]) ** 2, (x.outright - DATA.outrightByAge[b]) ** 2);
  });
  groups.push(mean(s));
  const o = [];
  m.older.forEach((x, i) => {
    for (const k of ['age_45_54_outright', 'age_45_54_mortgage', 'age_55_64_outright', 'age_55_64_mortgage']) o.push((x[k] - DATA.olderMortgage[i][k]) ** 2);
  });
  groups.push(mean(o));
  const q = [];
  const T = DATA.tenureByIncomeQuintile;
  m.quintiles.forEach((x, i) => q.push((x.outright - T.outright[i]) ** 2, (x.mortgage - T.mortgage[i]) ** 2, (x.renting - T.renting[i]) ** 2));
  groups.push(mean(q));
  // Weighted double: 2 years off counts like 10 points off.
  groups.push(2 * mean(m.firstBuyAge.map((a, i) => ((a - FIRST_BUY_AGE[i][2]) / 20) ** 2)));
  return { total: mean(groups), groups };
}

const giftsPerHousehold = (sim, from, to) =>
  mean(sim.stats.slice(from - START, to - START + 1).map((s) => s.gifts / s.n));

// Help to buy is a share of the parent's wealth (HELP_SHARE), capped at a
// fitted amount. The PC's gift total counts all gifts from parents, not only
// help with housing, so it is a check here, not a target.
const HELP_SHARE = 0.1;
function run(params) {
  return { sim: simulate({ ...params, giveRate: HELP_SHARE }), giveRate: HELP_SHARE };
}

// --- search ---------------------------------------------------------------

// Bounds keep each parameter plausible, so the fit can't hide a structural
// gap behind an implausible number: banks' serviceability tests sit around
// 30% of income (25–40% here); house prices within a market vary a lot but
// not without limit.
const SPACE = [
  ['saveRate', 0.05, 0.6],
  ['saveHalf', 20000, 300000],
  ['giveCap', 10000, 200000],
  ['housingShare', 0.25, 0.4],
  ['housingSharePre1986', 0.15, 0.4],
  ['incomeSpread', 0.3, 1],
  ['incomeNoise', 0, 0.6],
  ['youngIncome', 0.4, 1],
  ['coupleOffset', -4, 8],
  ['firstDeposit', 0.05, 0.25],
  ['priceSpread', 0, 0.6],
];
const toParams = (x) => Object.fromEntries(SPACE.map(([k, lo, hi], i) => [k, lo + (hi - lo) / (1 + Math.exp(-x[i]))]));
const fromParams = (p) => SPACE.map(([k, lo, hi]) => { const u = (p[k] - lo) / (hi - lo); return Math.log(u / (1 - u)); });

function f(x) {
  return loss(measure(run(toParams(x)).sim)).total;
}

function nelderMead(fn, x0, { iters = 160, step = 0.6 } = {}) {
  const n = x0.length;
  let pts = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step : v)))].map((x) => ({ x, f: fn(x) }));
  for (let it = 0; it < iters; it++) {
    pts.sort((a, b) => a.f - b.f);
    const c = x0.map((_, j) => mean(pts.slice(0, n).map((p) => p.x[j])));
    const worst = pts[n];
    const at = (t) => c.map((v, j) => v + t * (worst.x[j] - v));
    const r = { x: at(-1) }; r.f = fn(r.x);
    if (r.f < pts[0].f) {
      const e = { x: at(-2) }; e.f = fn(e.x);
      pts[n] = e.f < r.f ? e : r;
    } else if (r.f < pts[n - 1].f) {
      pts[n] = r;
    } else {
      const k = { x: at(0.5) }; k.f = fn(k.x);
      if (k.f < worst.f) pts[n] = k;
      else pts = pts.map((p, i) => (i === 0 ? p : { x: p.x.map((v, j) => pts[0].x[j] + 0.5 * (v - pts[0].x[j])) })).map((p) => ('f' in p ? p : { ...p, f: fn(p.x) }));
    }
    if (process.env.TRACE && it % 10 === 0) console.error(it, pts[0].f.toFixed(5), JSON.stringify(toParams(pts[0].x)));
  }
  pts.sort((a, b) => a.f - b.f);
  return pts[0];
}

const start = fromParams({ saveRate: 0.21, saveHalf: 136000, giveCap: 59000, housingShare: 0.289, housingSharePre1986: 0.24, incomeSpread: 0.91, incomeNoise: 0.48, youngIncome: 0.63, coupleOffset: 2.7, firstDeposit: 0.18, priceSpread: 0.37 });
const best = nelderMead(f, start);
const r3 = (v) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 1000) / 1000);
const fitted = Object.fromEntries(Object.entries(toParams(best.x)).map(([k, v]) => [k, r3(v)]));
const fit = { ...fitted, giveRate: HELP_SHARE };
writeFileSync(join(ROOT, 'src', 'calibration.generated.js'),
  '// GENERATED by scripts/calibrate.mjs. Do not edit; see data/CALIBRATION.md.\n' +
  `export const CALIBRATION = ${JSON.stringify(fit, null, 1)};\n`);

// --- report ---------------------------------------------------------------

const final = simulate(fit);
const m = measure(final);
const L = loss(m);
const pct = (x) => `${Math.round(100 * x)}%`;
const k = (x) => `$${Math.round(x / 1e3).toLocaleString('en-AU')}k`;
const dollars = (x) => `$${Math.round(x).toLocaleString('en-AU')}`;
const median = (xs) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
const firstBuys = final.buys.filter((e) => e.kind === 'starter' && !e.cash);
const bequestsPerHousehold = mean(final.stats.slice(2016 - START, 2020 - START + 1).map((s) => s.bequests / s.n));
const heirAges = final.bequests.filter((b) => b.year >= 2000 && b.year <= 2020).map((b) => b.year - b.to.born);

const lines = [
  '# Calibration', '',
  'Generated by `scripts/calibrate.mjs`. The model runs through history and is fitted to',
  'four groups of targets at once, weighted equally (root-mean-square error shown per group).', '',
  '## Parameters', '',
  `- Saving (before 65): up to **${(100 * fit.saveRate).toFixed(1)}%** of income, rising with income (half that at ${dollars(fit.saveHalf)}); both fitted.`,
  `- Lending limit: **${(100 * fit.housingShare).toFixed(1)}%** of income (fitted): the most a new loan's first year of`,
  '  repayments, at that year\'s nominal rate, may take. Banks\' usual rule of thumb is about 30%.',
  `- Lending limit before 1986: **${(100 * fit.housingSharePre1986).toFixed(1)}%** (fitted): before financial deregulation`,
  '  (1983–86) banks rationed home lending.',
  `- Income spread: **${fit.incomeSpread}** (fitted). Each lifetime-income row's income is one year's decile`,
  '  income pulled towards the age\'s middle: 1 would be one year\'s spread, 0 everyone the same.',
  `- First-home deposit: **${Math.round(100 * fit.firstDeposit)}%** of the price (fitted; first buyers put down 5–20%).`,
  `- Income variation within a row: **${fit.incomeNoise}** (fitted, sd of log income: one or two earners, careers).`,
  `- Young incomes: at 20 a household earns **${Math.round(100 * fit.youngIncome)}%** of its row's ABS income, rising to all of it`,
  `  ${fit.coupleOffset >= 0 ? fit.coupleOffset + ' years after' : -fit.coupleOffset + ' years before'} that year's median age at first marriage (ABS: 22 in 1971, 30 in 2021), as couples form (fitted).`,
  `- House price spread: **${fit.priceSpread}** (fitted), the standard deviation of the log of each household's`,
  '  house price relative to the mean dwelling (where it buys).',
  `- Help to buy: when a child (25–44) can't yet buy alone, 40% of parents who own outright give **${(100 * fit.giveRate).toFixed(0)}%** of their wealth, at most **${dollars(fit.giveCap)}** (cap fitted), once. Model help`,
  `  2017–2019: ${dollars(giftsPerHousehold(final, 2017, 2019))} per household a year; PC, all gifts from parents: ${dollars(GIFT_TARGET)}.`, '',
  `Fit (RMSE, percentage points): Census by age ${(100 * Math.sqrt(L.groups[0])).toFixed(1)}, SIH tenure by age ${(100 * Math.sqrt(L.groups[1])).toFixed(1)},`,
  `older owners over time ${(100 * Math.sqrt(L.groups[2])).toFixed(1)}, tenure by income quintile ${(100 * Math.sqrt(L.groups[3])).toFixed(1)};`,
  `first home buyers' mean age 1996–2012 ${m.firstBuyAge[0].toFixed(1)} (ABS 32–33), 2015–2018 ${m.firstBuyAge[1].toFixed(1)} (ABS 34–36).`, '',
  '## Census home ownership by age (model / Census)', '',
  '| Age | ' + CENSUS_YEARS.join(' | ') + ' |', '|---' + '|---'.repeat(CENSUS_YEARS.length) + '|',
  ...Object.keys(DATA.censusOwnByAge).map((g) => `| ${g} | ` + CENSUS_YEARS.map((y) => `${pct(m.census[g][y])} / ${pct(DATA.censusOwnByAge[g][y])}`).join(' | ') + ' |'),
  '',
  '## Tenure by age, 2019-20 (model / ABS)', '',
  '| Age band | Renting | Mortgaged | Outright |', '|---|---|---|---|',
  ...m.sih.map((x, b) => {
    const own = DATA.outrightByAge[b] + DATA.mortgagedByAge[b];
    return `| ${DATA.ageBands[b]} | ${pct(x.rent)} / ${pct(1 - own)} | ${pct(x.mortgage)} / ${pct(DATA.mortgagedByAge[b])} | ${pct(x.outright)} / ${pct(DATA.outrightByAge[b])} |`;
  }),
  '',
  'ABS renting here includes its "other" tenure (2–6%).', '',
  '## Older owners over time (model / ABS)', '',
  '| Year | 45–54 mortgaged | 45–54 outright | 55–64 mortgaged | 55–64 outright |', '|---|---|---|---|---|',
  ...m.older.map((x, i) => {
    const o = DATA.olderMortgage[i];
    return `| ${x.year - 1}-${String(x.year).slice(2)} | ${pct(x.age_45_54_mortgage)} / ${pct(o.age_45_54_mortgage)} | ${pct(x.age_45_54_outright)} / ${pct(o.age_45_54_outright)} | ${pct(x.age_55_64_mortgage)} / ${pct(o.age_55_64_mortgage)} | ${pct(x.age_55_64_outright)} / ${pct(o.age_55_64_outright)} |`;
  }),
  '',
  '## Tenure by income quintile, 2019-20 (model / ABS)', '',
  'Model quintiles rank households by current household income; ABS by equivalised disposable income.', '',
  '| Quintile | Renting | Mortgaged | Outright |', '|---|---|---|---|',
  ...m.quintiles.map((x, i) => `| ${i + 1} | ${pct(x.renting)} / ${pct(DATA.tenureByIncomeQuintile.renting[i])} | ${pct(x.mortgage)} / ${pct(DATA.tenureByIncomeQuintile.mortgage[i])} | ${pct(x.outright)} / ${pct(DATA.tenureByIncomeQuintile.outright[i])} |`),
  '',
  '## Checks (not fitted)', '',
  `- First home bought with a mortgage, 2010–2020: median age ${median(firstBuys.filter((e) => e.year >= 2010 && e.year <= 2020).map((e) => e.age)).toFixed(0)}`,
  '  (ABS: first home buyers averaged 32–33 from 1995-96 to 2011-12, and 34 in 2015-16).',
  `- Estates passed down, 2016–2020: ${dollars(bequestsPerHousehold)} per household a year. PC, 2018 (figure 1.7):`,
  `  $${(DATA.inheritanceOutflow2018.hilda / 1e9).toFixed(0)}B estimated from HILDA, ${dollars(DATA.inheritanceOutflow2018.hilda / DATA.households)} per household.`,
  `- Heirs' median age, 2000–2020: ${median(heirAges).toFixed(0)} (PC: most inheritances go to people in their 50s and early 60s).`,
  '- First home purchases by period (model count; ABS first-home-buyer loan commitments a year, for shape):',
  ...[[2003, 2007], [2008, 2012], [2013, 2017], [2018, 2022]].map(([a, b]) => {
    const n = firstBuys.filter((e) => e.year >= a && e.year <= b).length;
    const abs = mean([...Array(b - a + 1)].map((_, i) => DATA.firstHomeBuyerLoans[a + i] ?? NaN).filter(Number.isFinite));
    return `  - ${a}–${b}: ${n} in the model; ABS ${Math.round(abs / 1000)}k a year.`;
  }),
  '',
  '## History', '',
  "| Year | House price | 25–39s owning | Over 65s' share of owned homes |", '|---|---|---|---|',
  ...[1970, 1980, 1990, 2000, 2010, 2020, 2030, 2050, 2070].map((y) => {
    const s = final.stats[y - START];
    return `| ${y} | ${k(s.price)} | ${pct(s.youngOwn / s.young)} | ${pct(s.homesOld / s.homes)} |`;
  }),
  '', 'After 2025 the price is held at its last level: a what-if, not a forecast.',
];
writeFileSync(join(ROOT, 'data', 'CALIBRATION.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
