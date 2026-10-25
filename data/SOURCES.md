# Sources and method

The animation runs on a deterministic housing model (`src/model.js`).
Everything it uses either comes from a published table below, is calibrated
to one, or is one of the assumptions named at the end.

- `scripts/build_data.py` reads the raw files in `data/raw/` (as downloaded)
  and writes `src/data.generated.js` and `data/VALIDATION.md`.
- `scripts/calibrate.mjs` fits the model's free shares and writes
  `src/calibration.generated.js` and `data/CALIBRATION.md`.

## Used by the model

### ABS: Household Income and Wealth, Australia, 2019-20

ABS Survey of Income and Housing, released 28 April 2022. At the time of
writing it is still the latest release in the series. Licence: CC BY 4.0.
<https://www.abs.gov.au/statistics/economy/finance/household-income-and-wealth-australia/2019-20>

| File | Table | Used for |
|---|---|---|
| `abs-sih-2019-20-10.xlsx` | 10.1 | Equivalised disposable income P10–P90 by age band, mean disposable and mean equivalised by age band (→ household income by decile and age); median disposable income of all households; housing costs by age (calibration comparison) |
| | 10.3 | Owners without and with a mortgage by age (calibration target); households by age |

### ABS: Total Value of Dwellings (6432.0)

The mean price of residential dwellings in Australia, for the four quarters of
2019-20: $668.8k, $686.8k, $694.7k and $689.4k, averaging **$684.9k**. ABS
publishes a mean, not a median. File: `abs-total-value-dwellings-643201.xlsx`.
<https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/total-value-dwellings>

### OECD: Analytical house prices indicators, Australia

The price-to-income ratio (`HPI_YDH`, 2015 = 100), 1970–2025. Each year's
house price is $684.9k × that year's ratio ÷ the 2019-20 ratio: the price at
2019-20 incomes, so incomes can stay fixed in 2019-20 dollars. Before 1970
the price is held at the 1970 level, and after the last year at the last
year's level (a what-if, not a forecast). File: `oecd-house-prices-aus.csv`.
<https://data-explorer.oecd.org/> (dataflow `DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES`).

### RBA: F5 indicator lending rates, G1 consumer price inflation

The model's money is in 2019-20 dollars, so it uses a **real** mortgage
rate. For each year 1970–2025 it takes the year's average standard variable
owner-occupier rate (F5), deflates it by that year's CPI growth (G1), then
averages across the years: **3.64%**. The nominal average is 8.78% and
inflation averaged 5.04%. Files: `rba-f5-lending-rates.csv`, `rba-g1-cpi.csv`.
<https://www.rba.gov.au/statistics/tables/>

### Productivity Commission: Wealth transfers and their economic effects (2021)

Licence: CC BY 4.0. <https://www.pc.gov.au/inquiries-and-research/wealth-transfers>

- Gifts from parents in 2018-19 totalled **$11.8B** (figure 1.9). Divided by
  ABS's 9,732,400 households, that is **$1,214** per household a year. The
  model's giving share is pinned to this.
- Intergenerational inheritance outflow, 2018 (figure 1.7): **$52B** (HILDA
  estimate) to **$70B** (administrative). Used as a check on the model's
  estates; not fitted.

## The model

The model runs through history one calendar year at a time, from a warm-up
in 1860 to 2070. The animation shows 1970–2070.

- **Rows.** Each row is an income decile among households of the same age.
  Its income at each age is the decile's ABS household disposable income,
  linear between the age bands' midpoints. A decile's mean is taken at its
  middle percentile (P15 halfway between P10 and P20, and so on), with P5
  extrapolated, and the top decile set so the ten deciles average to the
  band's ABS mean. Equivalised income is converted to household income by
  the band's mean disposable ÷ mean equivalised. Rows are staggered by a
  quarter of a year so they don't move in lockstep.
- **Households.** Each row has a household born every 2.5 years, so 28 are
  alive at any time. A household's parent is the one 25 years older in the
  same row. Each year, every household:
  - *Renting:* saves the saving share of income (before 65), plus any help
    from its parent. It buys at this year's price as soon as it has a 20%
    deposit and a 30-year loan's repayments, at the real rate, fit within the
    housing share of its income.
  - *Mortgage:* makes those fixed real repayments, plus any help from its
    parent, until the loan is cleared.
  - *Owned outright:* gives the giving share of its income to its child
    until the child owns outright too.
  - From 65, spends its savings down evenly to 90.
  - At 90, dies. Its estate (the house at this year's price, plus what is
    left, less any debt) goes to its child, who is 65. If the child already
    owns outright, the estate goes on to the grandchild (40) if they don't.
    An estate pays off a mortgage, or goes into savings (and can buy a house).
- **House values.** An owner's house is always worth this year's price, so
  owners' wealth rises with the market. An estate's house is sold, and the
  heir gets cash.
- **Wealth** (dot size) is savings plus home equity. There is no return on
  savings, super, shares or second property.

## Calibration

The saving share and housing share are fitted on a grid. The target is the
model's 2019-20 (the average of its 2019 and 2020) against ABS 2019-20 home
ownership by age: owners, and owners outright, for each of 7 age bands. The
giving share is pinned so the model's 2017–2019 gifts per household equal
the PC's.

The result: save **4%** of income, a lending limit of **32%** of income, and
give **4.6%**. The fit is good from 55 up, and too low for owners under 45.
Owners outright come in early at 35–54, because help and estates clear some
mortgages. Estates passed down are about $8,200 per household a year, against
the PC's $5,300–$7,200. The full tables, and the history by decade, are in
`data/CALIBRATION.md`.

## Assumptions (not data)

- A household stays in its income decile all its life, and its children
  are in the same decile. Real incomes and families move between deciles.
- Incomes are fixed at 2019-20 levels, and prices move with the
  price-to-income ratio.
- Everyone buys the same house, at the mean price. In reality, lower
  incomes buy cheaper homes.
- A 20% deposit, a 30-year loan at a constant real rate, a 25-year gap
  between parent and child, and death at exactly 90.
- One heir per estate, with no surviving spouse, aged care costs or other
  heirs. An heir who already owns outright passes the estate straight on to
  their own child.

## Reference only

`data/VALIDATION.md` also documents the data behind earlier versions of
this animation: ABS net worth by age and decile (tables 2.1, 7.2, 10.2) and
the PC's transfers by age and wealth quintile (`pc-wealth-transfers-*`). The
current model doesn't use them, apart from the PC gift total above.
