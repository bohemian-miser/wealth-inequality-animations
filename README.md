# Wealth inequality animations

Animations of how wealth is held and passed between generations in
Australia, built from published ABS and Productivity Commission tables.
Plain HTML and canvas: no build step and no dependencies at runtime.

**Live:** <https://bohemian-miser.github.io/wealth-inequality-animations/>

## 1. Passing it back

A grid of 240 households. Each row is a wealth decile among households of the
same age, with the richest at the top. Dots drift left to right as their
households age from 20 to 90, and a dot's area is its net worth (ABS
2019-20). Parents pass gifts (gold) and inheritances (pink) to adult children
at the rates, ages and amounts the Productivity Commission measured in HILDA.
Each child's gold core is what they have received so far.

The squeeze is a what-if: extra yearly costs that a parent must cover out of
cash before giving. Using ABS figures for cash on hand (about $9k for the
bottom fifth, $233k for the top), the lower rows stop giving first. The
gauge shows what parents in each row pass back each year, and the dashed
part is what the squeeze took.

`?shock=20000` starts with a $20k squeeze; `?speed=4` at 4 years a second (¼ to 4).

## Grounding

- [`data/SOURCES.md`](data/SOURCES.md): every source table, the method, and
  each assumption, named.
- [`data/VALIDATION.md`](data/VALIDATION.md): the model checked against ABS.
  The national percentiles match exactly, and each age band's mean is within
  a few percent. It is also checked against ACOSS & UNSW figures it was not
  fitted to.
- `data/raw/`: the published files, unmodified (CC BY 4.0).

The model is calibrated to these sources, but it is still a model. The
squeeze in particular is an assumption built on real cash buffers, not a
measured behaviour.

## Develop

```bash
python3 -m http.server 8000                 # open http://localhost:8000/
pip install -r scripts/requirements.txt     # to rebuild the data
python3 scripts/build_data.py               # → src/data.generated.js, data/VALIDATION.md
```

Every push to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Data licences

ABS and Productivity Commission material © Commonwealth of Australia,
CC BY 4.0. Sources: Australian Bureau of Statistics, *Household Income and
Wealth, Australia, 2019-20*; Productivity Commission, *Wealth transfers and
their economic effects* (2021).
