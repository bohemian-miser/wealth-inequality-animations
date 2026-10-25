// The numbers the animations are calibrated to. Illustrative, not a
// microsimulation: each figure below is from a published source, and the
// gaps between them are filled by simple interpolation.
//
// ACOSS & UNSW Sydney, "Inequality in Australia 2024: Who is affected and
// how" (April 2024), ABS Survey of Income and Housing 2022-23:
//   - top 10% of households: average $5.2M, 44% of all wealth
//   - lowest 60%: average $343k
//   - under 35 average $410k; 35-64 average $1.26M; over 65 average $1.58M
//   - (2018 edition) top 20% hold ~100x the bottom 20% ($2.9M vs $30k)
// Productivity Commission, "Wealth transfers and their economic effects"
// (December 2021):
//   - ~$1.5 trillion passed on over 2002-2018, ~90% as inheritances
//   - givers are mostly older; receivers mostly middle-aged and younger

// Average household net worth per decile, bottom (index 0) to top (9).
// Chosen so the top decile is $5.2M, the lowest six average $343k, and the
// total puts the top decile at 44% of all wealth.
export const DECILE_WEALTH = [
  30e3, 90e3, 200e3, 380e3, 560e3, 800e3, 1.1e6, 1.45e6, 2.0e6, 5.2e6,
];

export const DECILE_LABELS = [
  'Bottom 10%', '10–20%', '20–30%', '30–40%', '40–50%',
  '50–60%', '60–70%', '70–80%', '80–90%', 'Top 10%',
];

export const AGE_MIN = 20;
export const AGE_MAX = 90;

// Wealth at an age relative to the all-ages average. Picked so ages under
// 35 average ~0.35 ($410k / $1.18M), 35-64 ~1.07, and 65+ ~1.34.
const AGE_CURVE = [
  [20, 0.08], [30, 0.3], [40, 0.72], [50, 1.05],
  [60, 1.3], [70, 1.42], [80, 1.36], [90, 1.25],
];

export function ageFactor(age) {
  if (age <= AGE_CURVE[0][0]) return AGE_CURVE[0][1];
  for (let i = 1; i < AGE_CURVE.length; i++) {
    const [a1, f1] = AGE_CURVE[i];
    if (age <= a1) {
      const [a0, f0] = AGE_CURVE[i - 1];
      const u = (age - a0) / (a1 - a0);
      const s = u * u * (3 - 2 * u);
      return f0 + (f1 - f0) * s;
    }
  }
  return AGE_CURVE[AGE_CURVE.length - 1][1];
}

export function baseWealth(decile, age) {
  return DECILE_WEALTH[decile] * ageFactor(age);
}

// What a household must keep for itself before it can pass anything on.
// `squeeze` 0 is easy times; 1 is a tight squeeze (costs, rates, rent,
// aged care). Exponential so the low rows drop out one by one.
export function needToKeep(squeeze) {
  return 25e3 * Math.pow(40, squeeze);
}

export const GIVE_FROM_AGE = 58; // who passes wealth back
export const RECEIVE_AGES = [22, 48]; // who it goes to

export function money(x) {
  if (x >= 1e6) return `$${(x / 1e6).toFixed(x >= 1e7 ? 0 : 1)}M`;
  if (x >= 1e3) return `$${Math.round(x / 1e3)}k`;
  return `$${Math.round(x)}`;
}
