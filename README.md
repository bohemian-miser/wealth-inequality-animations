# Wealth inequality animations

Animations of how wealth is held and passed between generations in
Australia, built from published ABS and Productivity Commission tables.
Plain HTML and canvas: no build step and no dependencies at runtime.

**Live:** <https://bohemian-miser.github.io/wealth-inequality-animations/>

## 1. Passing it back

A grid of households. Each row is an income decile among households of the
same age, with the highest at the top. Dots drift left to right as their
households age from 20 to 90, and a dot's size is its wealth.

Every row lives one deterministic life, using ABS 2019-20 incomes:
1. Rent and save (grey).
2. Buy the house once the mortgage is affordable (blue).
3. Pay it off (green).
4. Then pass part of its income to the child in the same row, 25 years
   younger, until the child owns outright too (gold).

Two curves trace the age each row buys and the age it owns outright.

The slider sets the house price, with marks for what a house would cost at
today's incomes using each year's price-to-income ratio (OECD). **Play
history** steps through 1970–2025. At the 1985 ratio, 9 of the 10 rows buy.
At 2019-20 prices 5 do, and at the 2024 ratio 3 do.

`?year=1985`, `?price=500000` and `?speed=2` set where it starts.

## Grounding

- [`data/SOURCES.md`](data/SOURCES.md): every source table, the model, and
  each assumption, named.
- [`data/CALIBRATION.md`](data/CALIBRATION.md): the fitted shares, home
  ownership by age against ABS, a wealth cross-check, and each row's life at
  three prices.
- [`data/VALIDATION.md`](data/VALIDATION.md): the data inputs, with checks.
- `data/raw/`: the published files, unmodified (CC BY 4.0).

It is calibrated to these sources, but it is still a model. Each row is a
single, typical life; the misses are listed in CALIBRATION.md.

## Develop

```bash
python3 -m http.server 8000                 # open http://localhost:8000/
pip install -r scripts/requirements.txt     # to rebuild the data
python3 scripts/build_data.py               # → src/data.generated.js, data/VALIDATION.md
node scripts/calibrate.mjs                  # → src/calibration.generated.js, data/CALIBRATION.md
```

Every push to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Data licences

ABS, RBA and Productivity Commission material © Commonwealth of Australia
(ABS and PC under CC BY 4.0; RBA statistical tables per the RBA's copyright
terms). OECD Analytical house prices indicators per the OECD's terms. See
data/SOURCES.md for each source.
