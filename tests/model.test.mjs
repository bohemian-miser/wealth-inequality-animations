// The model's own rules, checked on a full run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../src/data.generated.js';
import {
  simulate, priceAt, START, END, AGE_MIN, AGE_MAX, GAP, RENT, MORTGAGE, OWNED,
} from '../src/model.js';

const sim = simulate();
const all = sim.rows.flat();
const aliveIn = (h, year) => year - h.born >= AGE_MIN && year - h.born < AGE_MAX;

test('prices follow the data, held flat outside it', () => {
  for (const [y, p] of Object.entries(DATA.priceByYear)) assert.equal(priceAt(Number(y)), p);
  const years = Object.keys(DATA.priceByYear).map(Number);
  assert.equal(priceAt(Math.min(...years) - 30), DATA.priceByYear[Math.min(...years)]);
  assert.equal(priceAt(END), DATA.priceByYear[Math.max(...years)]);
});

test('a household has a state exactly in the years it is alive', () => {
  for (const h of all) {
    for (let year = START; year <= END; year++) {
      const st = h.st[year - START];
      if (aliveIn(h, year)) assert.ok(st >= 0, `born ${h.born} row ${h.row}: no state at ${year}`);
      else assert.equal(st, -1, `born ${h.born} row ${h.row}: state at ${year} while not alive`);
    }
  }
});

test('nobody goes back to renting, and states only move forward', () => {
  const allowed = new Set([`${RENT}>${MORTGAGE}`, `${RENT}>${OWNED}`, `${MORTGAGE}>${OWNED}`, `${OWNED}>${MORTGAGE}`]);
  for (const h of all) {
    let prev = null;
    for (const st of h.st) {
      if (st < 0) continue;
      if (prev !== null && st !== prev) assert.ok(allowed.has(`${prev}>${st}`), `${prev} → ${st}`);
      prev = st;
    }
  }
});

test('wealth is finite and owners hold their home', () => {
  for (const h of all) {
    for (let k = 0; k < h.st.length; k++) {
      if (h.st[k] < 0) continue;
      assert.ok(Number.isFinite(h.wealth[k]));
      if (h.st[k] === RENT) assert.ok(h.wealth[k] >= -1, 'a renter has no debt');
    }
  }
});

test('every estate goes from the dead to a living heir in the same line', () => {
  const from = new Set();
  for (const b of sim.bequests) {
    assert.equal(b.from.row, b.row);
    assert.equal(b.to.row, b.row);
    assert.equal(b.from.died, b.year, 'leaves the year it dies');
    assert.ok(!from.has(b.from), 'one estate per household');
    from.add(b.from);
    const gap = b.to.born - b.from.born;
    assert.ok(gap === GAP || gap === 2 * GAP, `heir ${gap} years younger`);
    assert.ok(aliveIn(b.to, b.year), 'heir alive');
    assert.ok(b.amount > 0);
    if (gap === 2 * GAP) {
      assert.equal(b.via.st[b.year - START], OWNED, 'skips a child only if they own outright');
    }
  }
});

test('every gift goes from an owner outright to their child who does not own outright', () => {
  for (const g of sim.gifts) {
    const k = g.year - START;
    assert.equal(g.to.born - g.from.born, GAP);
    assert.equal(g.from.row, g.to.row);
    assert.equal(g.from.st[k], OWNED);
    assert.ok(aliveIn(g.from, g.year) && aliveIn(g.to, g.year));
    assert.notEqual(g.to.st[k - 1] ?? -1, OWNED, 'not already owning outright');
    assert.ok(g.amount > 0);
  }
});

test('2019-20 tenure is in the range calibrated against ABS', () => {
  const n = [0, 0, 0];
  for (const h of all) {
    const st = h.st[2020 - START];
    if (st >= 0) n[st]++;
  }
  const total = n[0] + n[1] + n[2];
  const share = n.map((v) => v / total);
  // ABS 2019-20: renting 31%, mortgaged 37%, outright 30%.
  assert.ok(Math.abs(share[RENT] - 0.31) < 0.1, `renting ${share[RENT]}`);
  assert.ok(Math.abs(share[MORTGAGE] - 0.37) < 0.15, `mortgaged ${share[MORTGAGE]}`);
  assert.ok(Math.abs(share[OWNED] - 0.30) < 0.12, `outright ${share[OWNED]}`);
});
