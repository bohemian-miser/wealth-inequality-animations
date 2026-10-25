# Wealth inequality animations

Animations of how wealth is held and passed between generations in
Australia, built from published ABS and Productivity Commission tables.
Plain HTML and canvas: no build step and no dependencies at runtime.

**Live:** <https://bohemian-miser.github.io/wealth-inequality-animations/>

## 1. Passing it back

A grid of households. Each row is an income decile, with the highest at the
top. Dots drift left to right as their households age from 20 to 90, while
the years run from 1970 to 2070. Every household, on its decile's ABS
2019-20 income:
1. Rents and saves (grey).
2. Buys at that year's house price once it can (blue).
3. Pays off a 30-year loan (green).
4. Passes yearly help to its child in the same row, 25 years younger (gold).

Owners' dots swell as house prices rise. At 90, the estate passes down
(pink): to the child, who is 65 by then, or past them to the grandchild if
the child already owns.

Two lines mark, for each row, the age from which everyone in it has bought,
and the age from which everyone owns outright. A strip chart tracks the
house price, the share of under-40s who own, and over-65s' share of all
owned homes.

House prices follow the OECD price-to-income ratio at today's incomes
through 2025, then are held at that level. In the model, under-40s owning
falls from 28% (1980) to 18% (2020) and then 13%. Over-65s' share of owned
homes rises from 45% to 60%. In the middle rows, home ownership ends up
arriving with the inheritance, at 65.

`?year=2000`, `?speed=2` and `?paused=1` set how it starts.

## Grounding

- [`data/SOURCES.md`](data/SOURCES.md): every source table, the model, and
  each assumption, named.
- [`data/CALIBRATION.md`](data/CALIBRATION.md): the fitted shares, 2019-20
  home ownership by age against ABS, estates passed down against the PC, and
  the history by decade.
- [`data/VALIDATION.md`](data/VALIDATION.md): the data inputs, with checks.
- `data/raw/`: the published files, unmodified (CC BY 4.0).

It is calibrated to these sources, but it is still a model. The misses are
listed in CALIBRATION.md and the assumptions in SOURCES.md.

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
