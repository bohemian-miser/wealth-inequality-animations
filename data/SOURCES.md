# Sources and method

The animation runs on a deterministic housing model (`src/model.js`).
Everything it uses either comes from a published table below, is calibrated
to one, or is one of the assumptions named at the end.

- `scripts/build_data.py` reads the raw files in `data/raw/` (as downloaded)
  and writes `src/data.generated.js` and `data/VALIDATION.md`.
- `scripts/calibrate.mjs` fits the model against history and writes
  `src/calibration.generated.js` and `data/CALIBRATION.md`.
- `npm test` checks the model's rules and the animation's timing.

## Inputs

### ABS: Household Income and Wealth, Australia, 2019-20

ABS Survey of Income and Housing, released 28 April 2022. It's the latest
release: the 2020-21 and 2021-22 collections were cancelled because of
COVID-19, and the ABS withheld the 2023-24 results over data collection
problems ([ABS statement, 17 July 2025](https://www.abs.gov.au/media-centre/media-statements/media-statement-6875eee35460c)).
Licence: CC BY 4.0.

| File | Table | Used for |
|---|---|---|
| `abs-sih-2019-20-10.xlsx` | 10.1 | Equivalised disposable income P10–P90, mean disposable and mean equivalised by age band (→ household income by decile and age); median disposable income |
| | 10.3 | Owners without and with a mortgage by age (calibration); households |

### ABS: Total Value of Dwellings (6432.0)

The mean price of residential dwellings in Australia (series A83728647F),
averaged over the four quarters of 2019-20: **$684.9k**. It is a stock value
(the value of all dwellings, units included, divided by their number), not a
sale price; ABS publishes a mean, not a median.
File: `abs-total-value-dwellings-643201.xlsx`.

### OECD: Analytical house prices indicators, Australia

The price-to-income ratio (`HPI_YDH`, 2015 = 100), 1970–2025: nominal house
prices over nominal disposable income **per head**. Each year's price is
$684.9k × that year's ratio ÷ the 2019-20 ratio: a price at 2019-20 incomes.

Caveat: households have shrunk (about 3.3 people in 1971, 2.6 now), so per
household, incomes grew less than per head. The early years' prices at
2019-20 household incomes are therefore overstated, by roughly a fifth for
1970–1990. Before 1970 the price is held at the 1970 level, and after 2025 at
the 2025 level (a what-if). File: `oecd-house-prices-aus.csv`.

### RBA: F5 lending rates, G1 consumer price inflation

The rates actually paid each year: the standard variable owner-occupier rate
to 2003, the discounted rate from 2004. Each year's real rate is that,
deflated by the year's CPI growth. Real rates were about −5% in the mid-1970s
(inflation ate mortgages) and about 8% around 1989–90. Before 1959 the model
uses 1959's rates; after 2026, the 1990–2025 averages (a what-if). Files:
`rba-f5-lending-rates.csv`, `rba-g1-cpi.csv`.

### ABS: life tables, 2022–2024

Table 9 (single years, by sex). A household's age at death is drawn from
the age at death after 65. A household ends at its last member's death: a
couple at the later of two deaths, a single person at their own. Over-65
households are taken as 55% couples (SIH table 6.1). The median comes to
about 88. The grid ends at 95, so a household still alive then dies at 95.
File: `abs-life-tables-2022-2024.xlsx`.

### Productivity Commission: Wealth transfers and their economic effects (2021)

Licence: CC BY 4.0. Amounts are in 2018 dollars.
<https://www.pc.gov.au/inquiries-and-research/wealth-transfers>

- **Gifts from parents** in 2018-19 totalled **$11.8B** (figure 1.9). Divided
  by 9,732,400 households, that is **$1,214** per household a year, and the
  model's gift rate is pinned to it. HILDA counts people, and all gifts from
  parents, not only help with housing.
- **Inheritance outflow, 2018** (figure 1.7): **$52B** estimated from
  HILDA. The PC's scaled Roach (2018) figure, $70B, is said by the PC to run
  high. Used as a check; not fitted.

## Calibration targets

| File | What |
|---|---|
| `aihw-home-ownership-by-age.csv` | Census home ownership by 5-year age group, 1971–2021 (AIHW, from housingdata.gov.au) |
| `abs-hoc-2019-20-6-age.xlsx` | ABS Housing Occupancy and Costs 2019-20, table 6.1: tenure by age |
| `abs-sih-2019-20-5.xlsx` | ABS SIH 2019-20, table 5.3: tenure by equivalised disposable income quintile |
| `abs-4130-older-mortgage-series.csv` | Owners outright and with a mortgage aged 45–54 and 55–64, 1997-98 to 2019-20, compiled from each ABS Housing Occupancy and Costs release (files in `abs-4130-archive/`; the CSV names each year's file and table) |
| `abs-lending-indicators-560124.xlsx` | First-home-buyer owner-occupier loan commitments a year, 2003–2025 (a check) |

## The model

The model runs through history one calendar year at a time, from a warm-up
in 1860 to 2070. The animation shows 1970–2070.

- **Rows** are lifetime-income tenths. A row's income at each age is the
  ABS decile income for that age, pulled towards the age's middle by a
  fitted *income spread* (1 = one year's spread). The fit settled on 0.97,
  close to one year's spread.
  - The decile incomes are *estimated* from ABS table 10.1. ABS publishes
    equivalised, person-weighted percentiles by age band, not household
    deciles.
  - A decile's mean is taken at its middle percentile (P5 extrapolated), and
    the top decile is set so the ten average to the band's mean.
  - Equivalised income is turned back into household income by the band's
    mean disposable ÷ mean equivalised.
- **Households.** Each row has one household born every 1.25 years. The
  rows are staggered a little so they don't move in lockstep. A household's
  parent is the one 30 years older in the same row. Each household also has:
  - its own **house price**: a factor around the mean dwelling value, with a
    fitted spread, standing for where it buys;
  - its own **age at death**, from the life tables.
- **Each year, every household:**
  - *Saves* (before 65) a fitted share of its income above a fitted
    living-cost floor. Gifts and estates go into savings too. From 65 it
    spends its savings down.
  - *Renting:* buys a **starter home** (70% of its house price) once it has
    a 10% deposit and the bank's test passes. The test: a 30-year loan's
    first-year repayments, at that year's nominal rate, fit within the
    lending limit. A household that can pay cash for its full house buys
    that instead.
  - *From 10 years on, if under 65:* trades up to its full house price as
    soon as a new 20-year loan passes the same test, rolling what it owes
    into that loan.
  - *Mortgage:* a variable-rate loan. Each year's repayment clears it over
    the years left, at that year's nominal rate. In 2019-20 dollars the debt
    grows at the real rate, so inflation wears it down.
  - *Owned outright:* gives its child a set share of its wealth each year
    until the child owns outright. The share is pinned to the PC's gift
    total, so gifts grow with house prices. Gifts aren't taken out of the
    parent's wealth; they stand for help paid from income.
  - *At death:* its estate (its home at this year's price, plus what's left,
    less debt) goes to its child.
- **House values.** An owner's home is always worth this year's price times
  its factor, so owners' wealth rises with the market.

## Calibration

The fit is a Nelder–Mead search over five parameters, against four target
groups weighted equally:
- Census ownership by age, 1981–2021;
- 2019-20 tenure by age;
- older owners, 1997–2020;
- 2019-20 tenure by income quintile.

Bounds keep each parameter plausible, so the fit can't hide a structural gap
behind a silly number. For example, the lending limit is held to 25–40%.

Result:

| Parameter | Value |
|---|---|
| Saving | 18.9% of income above $54k |
| Lending limit | 25% of income, at the lower bound |
| Income spread | 0.97 |
| House price spread | 0.47 |
| Gift rate | 0.26% of the parent's wealth a year |

Fit (root-mean-square error, percentage points):

| Target group | Error |
|---|---|
| Census by age | 5.0 |
| 2019-20 tenure by age | 6.5 |
| Older owners over time | 11.9 |
| Tenure by income quintile | 10.0 |

The full tables and the checks are in `data/CALIBRATION.md`.

## Known gaps

- First buyers are younger in the model (a median of 26 for 2010–2020) than
  the ABS's average of 32–34.
- Too few high-income households rent: 3% of the top income fifth, against
  ABS's 25%.
- Estates passed down run about twice the PC's estimate.
- 45–54-year-olds in the late 1990s own outright too rarely.
- The lowest row rents for life.
- Every household keeps one row and has one child. After 2025, prices and
  rates are held (a what-if).

## Reference only

`data/VALIDATION.md` also documents the data behind earlier versions of
this animation: ABS net worth by age and decile, and the PC's transfers by
age and wealth quintile. The current model doesn't use them.
