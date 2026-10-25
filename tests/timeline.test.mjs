// What the animation shows, and when: transfers land on the moment their
// recipient's dot changes, at every speed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, START, AGE_MAX } from '../src/model.js';
import {
  phaseOf, shownYear, shownState, estateArrivals, giftTiming, estateTiming,
  estateMinFlight, onScreen, byYear, activeTransfers,
} from '../src/timeline.js';

const sim = simulate();
const SPEEDS = [0.5, 1, 2, 4, 8];
const EPS = 1e-6;
const estateOf = new Map(sim.bequests.map((b) => [b.from, b]));
const arrivals = estateArrivals(sim.bequests);

test('phases are in [0, 1) and differ between neighbours', () => {
  const ps = new Set();
  for (const h of sim.rows.flat()) {
    const p = phaseOf(h);
    assert.ok(p >= 0 && p < 1);
    ps.add(p.toFixed(6));
  }
  assert.ok(ps.size > sim.rows.flat().length * 0.9, 'phases mostly distinct');
});

test('an estate lands exactly when its heir shows the year it arrives', () => {
  for (const b of sim.bequests) {
    for (const speed of SPEEDS) {
      const { launch, land } = estateTiming(b, speed);
      assert.equal(shownYear(b.to, land - EPS), b.year - 1, 'heir still on the old year just before');
      assert.equal(shownYear(b.to, land + EPS), b.year, 'heir on the new year as it lands');
      assert.ok(land - launch >= estateMinFlight(speed) - EPS, 'visible flight');
      assert.ok(launch <= b.from.born + AGE_MAX + EPS, 'leaves no later than the death');
    }
  }
});

test('the dying household is on screen until its estate leaves, then gone', () => {
  for (const b of sim.bequests) {
    for (const speed of SPEEDS) {
      const { launch } = estateTiming(b, speed);
      if (launch - EPS - b.from.born >= 20) assert.ok(onScreen(b.from, launch - EPS, b, speed));
      assert.ok(!onScreen(b.from, launch + EPS, b, speed));
      // While shown past 90 it holds its last living year.
      const st = shownState(b.from, launch - EPS, arrivals).st;
      assert.ok(st >= 0, 'has a state to draw');
    }
  }
});

test('a gift lands as its recipient turns to the year it was given', () => {
  for (const g of sim.gifts) {
    const { launch, land } = giftTiming(g, 1);
    assert.ok(launch < land);
    // (In a recipient's first year there is no earlier year to show.)
    if (g.year > Math.ceil(g.to.born + 20)) assert.equal(shownYear(g.to, land - EPS), g.year - 1);
    assert.equal(shownYear(g.to, land + EPS), g.year);
  }
});

test('households never show a year after they died', () => {
  for (const h of sim.rows.flat()) {
    if (h.died === null || h.died <= START + 1) continue;
    for (let t = h.died - 2; t < h.died + 2; t += 0.1) assert.ok(shownYear(h, t) <= h.died - 1);
  }
});

test('drawn wealth moves smoothly except when an estate lands', () => {
  const landings = new Map();
  for (const b of sim.bequests) landings.set(b.to, [...(landings.get(b.to) ?? []), estateTiming(b, 1).land]);
  let jumps = 0;
  for (const h of sim.rows.flat().filter((_, i) => i % 7 === 0)) {
    let prev = null;
    for (let t = Math.max(1970, h.born + 20.5); t < Math.min(2070, h.born + 89); t += 0.05) {
      const { w } = shownState(h, t, arrivals);
      if (prev !== null) {
        const near = (landings.get(h) ?? []).some((l) => Math.abs(l - t) < 0.06);
        // Allowed: a purchase or trade-up can move wealth (stamp-duty-free model:
        // savings become equity), but not by more than a few percent of a home.
        if (!near && Math.abs(w - prev) > 60000) jumps++;
      }
      prev = w;
    }
  }
  assert.equal(jumps, 0, `${jumps} sudden wealth jumps not explained by an estate`);
});

test('activeTransfers returns exactly the transfers in their window', () => {
  const gifts = byYear(sim.gifts), bequests = byYear(sim.bequests);
  for (const speed of [1, 8]) {
    const hold = 0.5;
    for (let t = 1990; t < 2000; t += 0.37) {
      const got = new Set(activeTransfers(gifts, bequests, t, speed, hold).map((m) => m.e));
      for (const g of sim.gifts.filter((e) => Math.abs(e.year - t) < 4)) {
        const { launch, land } = giftTiming(g, speed);
        assert.equal(got.has(g), t >= launch && t < land);
      }
      for (const b of sim.bequests.filter((e) => Math.abs(e.year - t) < 6)) {
        const { launch, land } = estateTiming(b, speed);
        assert.equal(got.has(b), t >= launch && t < land + hold);
      }
    }
  }
});

test('the start year has no stale state', () => {
  for (const h of sim.rows.flat()) {
    if (1970 - h.born < 20 || 1970 - h.born >= AGE_MAX) continue;
    assert.ok(shownState(h, 1970, arrivals).st >= 0);
    assert.ok(h.st[1970 - START] >= 0);
  }
});
