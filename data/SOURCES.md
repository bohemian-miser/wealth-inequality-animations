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

The price-to-income ratio (`HPI_YDH`, 2015 = 100), 1970–2025. A year's mark
on the slider is $684.9k × that year's ratio ÷ the 2019-20 ratio: the price
a house would have at 2019-20 incomes. File: `oecd-house-prices-aus.csv`.
<https://data-explorer.oecd.org/> (dataflow `DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES`).

### RBA: F5 indicator lending rates, G1 consumer price inflation

The model's money is in 2019-20 dollars, so it uses a **real** mortgage
rate. For each year 1970–2025 it takes the year's average standard variable
owner-occupier rate (F5), deflates it by that year's CPI growth (G1), then
averages across the years: **3.64%**. The nominal average is 8.78% and
inflation averaged 5.04%. Files: `rba-f5-lending-rates.csv`, `rba-g1-cpi.csv`.
<https://www.rba.gov.au/statistics/tables/>

### Productivity Commission: Wealth transfers and their economic effects (2021)

Gifts from parents in 2018-19 totalled **$11.8B** (figure 1.9). Divided by
ABS's 9,732,400 households, that is **$1,214** per household a year. The
model's giving share is pinned to this. Licence: CC BY 4.0.
<https://www.pc.gov.au/inquiries-and-research/wealth-transfers>

## The model

- **Rows.** Each row is an income decile among households of the same age.
  Its income at each age is the decile's ABS household disposable income,
  linear between the age bands' midpoints. A decile's mean is taken at its
  middle percentile (P15 halfway between P10 and P20, and so on), with P5
  extrapolated, and the top decile set so the ten deciles average to the
  band's ABS mean. Equivalised income is converted to household income by
  the band's mean disposable ÷ mean equivalised.
- **One life per row, each year from 20 to 89:**
  - *Renting:* save the saving share of income, plus any help from parents.
    Buy as soon as savings cover a 20% deposit *and* the rest can be repaid
    within 30 years, at the real rate, on the housing share of income. (The
    repayment test always binds before the deposit does.)
  - *Mortgage:* pay the housing share of income (and any help) off the loan.
    Keep saving the saving share.
  - *Owned outright:* keep saving, and give the giving share of income to the
    child until the child owns outright too.
- **Wealth** (dot size) is savings plus home equity, with no return on
  savings, no super, shares, other property or inheritances. It sits near
  ABS median net worth by age and below the mean (see CALIBRATION.md).
- **Generations.** A row's child is the same row, 25 years younger, and every
  generation lives the same life (a steady state). The model iterates until
  parent and child agree.

## Calibration

The saving share and housing share are fitted on a grid to ABS 2019-20 home
ownership by age: owners, and owners outright, for each of 7 age bands. Each
band is run at the price its cohort faced at about 30. Today's 75-year-olds
bought at 1970 ratios, not today's. The giving share is pinned to the PC's
gift total at the 2019-20 price.

The result: save **10%**, housing **17%**, give **4.75%**. The fit is flat
for housing shares between about 17% and 25%. For comparison, ABS housing
costs ÷ disposable income are 19% for 25–34s and 18% for 35–44s. Where the
fit misses: under-45s own less in the model than in ABS, and 45–64s own
outright too early. Both happen because the model buys once, at the mean
price, while real buyers start cheaper and trade up later. The full tables
are in `data/CALIBRATION.md`.

## Assumptions (not data)

- A household stays in its income decile all its life, and its child is in
  the same decile. Real incomes and families move between deciles.
- Everyone buys the same house, at the mean price. In reality, lower
  incomes buy cheaper homes.
- A 20% deposit, a 30-year repayment test, and a 25-year gap between parent
  and child.
- Everything is in 2019-20 dollars at a constant real mortgage rate, and the
  house price is the only thing the slider changes.

## Reference only

`data/VALIDATION.md` also documents the data behind earlier versions of
this animation: ABS net worth by age and decile (tables 2.1, 7.2, 10.2) and
the PC's transfers by age and wealth quintile (`pc-wealth-transfers-*`). The
current model doesn't use them, apart from the PC gift total above.
