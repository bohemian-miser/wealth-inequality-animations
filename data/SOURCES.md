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
prices over nominal disposable income **per head**. Households have shrunk,
from 3.3 people in 1971 to 2.5 in 2021 (Census; `abs-household-size.csv`), so
per household, incomes grew less than per head. Each year's price is
therefore:

> $684.9k × that year's ratio ÷ the 2019-20 ratio × (2019-20 persons per
> household ÷ that year's)

That gives a price at 2019-20 *household* incomes: $291k in 1970, $400k in
1995, $826k in 2025. After 2025 the price is held at that level (a what-if,
not a forecast). File: `oecd-house-prices-aus.csv`.

### Before 1970: the Macrohistory Database

The model's households need a past: today's 90-year-olds bought in the 1950s.
From 1950 to 1969, the per-head price ratio follows the Jordà–Schularick–
Taylor Macrohistory Database (release 6): its house price index for
Australia, which is Stapledon's Sydney–Melbourne series, over GDP per head,
relative to 1970. Prices were legally pegged from 1942 to 1949, so earlier
years take the 1951–55 average. Over those decades the ratio is roughly flat,
apart from 1950's jump when controls ended. Files:
`jst-macrohistory-R6.dta`, and `jst-aus-house-price-ratios.csv` derived from
it. <https://www.macrohistory.net/>

### RBA: F5 lending rates, G1 consumer price inflation

The rates actually paid each year: the standard variable owner-occupier rate
to 2003, the discounted rate from 2004. Each year's real rate is that,
deflated by the year's CPI growth. Real rates were about −5% in the mid-1970s
(inflation ate mortgages) and about 8% around 1989–90. Before 1959, when the
RBA series starts, home lending rates were regulated and barely moved. The
model holds 1959's nominal rate and deflates it by each year's CPI, giving
about −12% in 1951–52, when inflation reached about 20%. After 2026 it uses
the 1990–2025 averages (a what-if). Files:
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
  by 9,732,400 households, that is **$1,214** per household a year. HILDA
  counts people, and all gifts from parents, not only help with housing, so
  this is a check on the model's help to buy, not a target.
- **Inheritance outflow, 2018** (figure 1.7): **$52B** estimated from
  HILDA. The PC's scaled Roach (2018) figure, $70B, is said by the PC to run
  high. Used as a check; not fitted.

## Calibration targets

| File | What |
|---|---|
| `aihw-home-ownership-by-age.csv` | Census home ownership by 5-year age group, 1971–2021 (AIHW, from housingdata.gov.au) |
| `abs-hoc-2019-20-6-age.xlsx` | ABS Housing Occupancy and Costs 2019-20, table 6.1: tenure by age |
| `abs-sih-2019-20-5.xlsx` | ABS SIH 2019-20, tables 5.2 and 5.3: tenure and dwelling values by equivalised disposable income quintile |
| `abs-4130-older-mortgage-series.csv` | Owners outright and with a mortgage aged 45–54 and 55–64, 1997-98 to 2019-20, compiled from each ABS Housing Occupancy and Costs release (files in `abs-4130-archive/`; the CSV names each year's file and table) |
| `abs-erp-by-age-3101059.xlsx` | ABS estimated resident population by age, 1971–2025 (weights for the statistics) |
| `abs-household-size.csv` | Persons per household by Census year, 1961–2021 (the price correction; sources in the file) |
| `abs-median-age-first-marriage.csv` | ABS median age at first marriage, 1971–2021 (young incomes; sources in the file) |
| `abs-lending-indicators-560124.xlsx` | First-home-buyer loan commitments a year, 2003–2025 (a check) |

## The model

The model runs through history one calendar year at a time, from a warm-up
in 1860 to 2070. The animation shows 1970–2070.

- **Rows** are lifetime-income tenths. A row's income at each age is the
  ABS decile income for that age, pulled towards the age's middle by a
  fitted *income spread*.
  - The decile incomes are *estimated* from ABS table 10.1. ABS publishes
    equivalised, person-weighted percentiles by age band, not household
    deciles.
  - Each household's income also varies around its row's, by a fitted
    spread (one or two earners, careers).
  - Young households earn a fitted share of the row's income at 20, rising
    to all of it a fitted number of years after that year's median age at
    first marriage. That is the ABS series averaged over men and women: 22
    in 1971, 30 in 2021, in `abs-median-age-first-marriage.csv`. Couples
    form later now, so dual incomes, and buying, come later.
- **Households.** Each row has one household born every 1.25 years. A
  household's parent is the one 30 years older in the same row. Each
  household has its own:
  - **house price:** the mean dwelling value × its income quintile's
    relative dwelling value (ABS table 5.2 over 5.3: 0.81 for the lowest
    quintile up to 1.41 for the highest) × a factor for where it lives
    (fitted spread);
  - **age at death:** from the life tables;
  - **chance of separating.**
- **Each year, every household:**
  - *Saves* (before 65) a share of its income that rises with income (a
    fitted maximum, reached half of at a fitted income), so low earners save
    a little and high earners a lot. Estates and help go into savings. From
    65 it spends its savings down.
  - *Renting:* buys a **starter home** (70% of its house price) once it has
    the fitted first-home deposit and the bank's test passes. The test: a
    loan's first-year repayments, at that year's nominal rate, within the
    lending limit. Loans run up to 30 years and must be repaid by 75. A
    household that can pay cash for its full house buys that instead.
  - *Help to buy:* when a child aged 25–44 can't yet buy alone, its parent
    may give once 10% of its wealth, up to a fitted cap (about $71k). The parent has to
    own outright and be one of the 40% of parents who help (an assumption:
    surveys find 17% of first buyers got cash help with the deposit and
    46–60% got some support). The help goes into savings, so it may let the
    child buy now or soon. About a third of the model's first buyers are
    helped, in every decade; surveys suggest that share has risen.
  - *From 10 years on, if under 65:* trades up to its full house price as
    soon as a new 20-year loan (repaid by 75) passes the same test, rolling
    what it owes into it.
  - *Mortgage:* a variable-rate loan. Each year's repayment clears it over
    the years left at that year's nominal rate, while in 2019-20 dollars the
    debt grows at the real rate, so inflation wears it down.
  - *Separates:* 30% of households split up at some point between 30 and
    60. A split owner sells, keeps half the equity and rents again, and may
    buy again later (a re-buy, not a first home). ABS: 28% of marriages
    begun in 1985–87 and 33% of those begun in 2000–02 are expected to end
    in divorce (Australian Social Trends 2007, in `abs-marriage/`).
  - *At death:* its estate (its home at this year's price, plus what's left,
    less debt) splits between two children; the one in the row gets half.
- **House values.** An owner's home is always worth this year's price times
  its factor, so owners' wealth rises with the market.
- **Statistics** weight households by Australia's real age structure each
  year (ABS estimated resident population by age). The model itself has the
  same number born every year.

## Calibration

The fit is a Nelder–Mead search over twelve parameters. Bounds keep each
one plausible; for example, the lending limit is held to 25–40%. It targets
five groups:
- Census ownership by age, 1971–2021;
- 2019-20 tenure by age;
- older owners, 1997–2020;
- 2019-20 tenure by income quintile;
- first home buyers' average age (1996–2012: 32.5; 2015–2018: 34.8),
  counted double.

Result:

| Parameter | Value |
|---|---|
| Lending limit | about 29% of income (24% before 1986) |
| First-home deposit | 17% |
| Saving | up to 23% of income, rising with income |
| Full income | about 2 years after the year's median age at first marriage |
| Help to buy cap | about $71k |

Fit (root-mean-square error, percentage points):

| Target | Error |
|---|---|
| Census by age | 8.0 |
| 2019-20 tenure by age | 7.4 |
| Older owners over time | 7.8 |
| Tenure by income quintile | 6.0 |

First buyers' mean age: 32.7 (1996–2012) and 33.6 (2015–2018). 25–39s
owning in the model: 52% in both 2010 and 2020, against the Census's about
53% and 48%. Estates passed down come to about $4,900 per household a year,
against the PC's $5,300 (HILDA).

The full tables, errors and checks are in `data/CALIBRATION.md`.

## Known gaps

- Older households own too often in the model: about 85–90% of over-65s,
  against the Census's about 80%.
- 45–54-year-olds in the late 1990s own outright less often than ABS
  recorded (23% against 43% in 1997-98).
- There is no public housing: renters are all one grey.
- The share of first buyers helped by family stays at about a third, while
  surveys suggest it has risen.
- Every household has one row and one child in it. After 2025, prices,
  rates and incomes are held (a what-if).

## Reference only

`data/VALIDATION.md` also documents the data behind earlier versions of
this animation: ABS net worth by age and decile, and the PC's transfers by
age and wealth quintile. The current model doesn't use them.
