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

ABS Survey of Income and Housing, released 28 April 2022. It's the latest
release: the 2020-21 and 2021-22 collections were cancelled because of
COVID-19, and the ABS withheld the 2023-24 results over data collection
problems ([ABS statement, 17 July 2025](https://www.abs.gov.au/media-centre/media-statements/media-statement-6875eee35460c)).
Licence: CC BY 4.0.
<https://www.abs.gov.au/statistics/economy/finance/household-income-and-wealth-australia/2019-20>

| File | Table | Used for |
|---|---|---|
| `abs-sih-2019-20-10.xlsx` | 10.1 | Equivalised disposable income P10–P90 by age band, mean disposable and mean equivalised by age band (→ estimated household income by decile and age); median disposable income of all households |
| | 10.3 | Owners without and with a mortgage by age (calibration target); households |

### ABS: Total Value of Dwellings (6432.0)

The mean price of residential dwellings in Australia (series A83728647F),
for the four quarters of 2019-20: $668.8k, $686.8k, $694.7k and $689.4k,
averaging **$684.9k**. It is a stock value: the value of all dwellings,
units included, divided by their number. It is not a sale price, and ABS
publishes a mean, not a median. File: `abs-total-value-dwellings-643201.xlsx`.
<https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/total-value-dwellings>

### OECD: Analytical house prices indicators, Australia

The price-to-income ratio (`HPI_YDH`, 2015 = 100), 1970–2025: the nominal
house price index divided by nominal disposable income **per head**. Each
year's house price is $684.9k × that year's ratio ÷ the 2019-20 ratio: the
price at 2019-20 incomes, so incomes can stay fixed in 2019-20 dollars.

Caveats. Households have shrunk (about 3.3 people in 1971, 2.6 now), so per
household, incomes grew less than per head. The early years' prices "at
2019-20 household incomes" are therefore overstated, by roughly a fifth for
1970–1990. The index also reflects changes in dwelling quality and mix.
Before 1970 the price is held at the 1970 level, and after the last year at
the last year's level (a what-if, not a forecast). File:
`oecd-house-prices-aus.csv`.
<https://data-explorer.oecd.org/> (dataflow `DSD_AN_HOUSE_PRICES@DF_HOUSE_PRICES`).

### RBA: F5 indicator lending rates, G1 consumer price inflation

The model's money is in 2019-20 dollars, so it uses a **real** mortgage
rate, worked out from the rates actually paid:
- the standard variable owner-occupier rate up to 2003;
- the discounted owner-occupier rate from 2004, when the RBA series starts
  (it runs 0.6–1.9 points below the standard rate).

Each year's average of those (F5) is deflated by that year's CPI growth
(G1), and the results are averaged over 1970–2025: **3.31%**. The nominal
rates paid averaged 8.44%, the headline standard rate 8.78%, and inflation
5.04%.

One rate for every year is a simplification. Real rates averaged 1.7% before
1990, when lending was regulated and credit rationed, and 4.2% from 1990.
Testing a loan at a real rate also hides how much heavier the first years'
repayments are in nominal terms (see CALIBRATION.md). Files:
`rba-f5-lending-rates.csv`, `rba-g1-cpi.csv`.
<https://www.rba.gov.au/statistics/tables/>

### Productivity Commission: Wealth transfers and their economic effects (2021)

Licence: CC BY 4.0. <https://www.pc.gov.au/inquiries-and-research/wealth-transfers>
Amounts are in 2018 dollars; the model's are 2019-20 (about 2–3% apart, not
adjusted).

- **Gifts from parents** in 2018-19 totalled **$11.8B** (figure 1.9).
  Divided by ABS's 9,732,400 households, that is **$1,214** per household a
  year, and the model's giving share is pinned to it.
  - HILDA counts people, and all gifts from parents, not only housing help.
    Most go to under-25s, and some may be loans.
  - 2018-19 is a single, noisy year: 2016–2019 averaged about $11.4B.
- **Intergenerational inheritance outflow, 2018** (figure 1.7): **$52B**
  estimated from HILDA, the central estimate. The PC's scaled version of
  Roach (2018) gives $70B, but the PC notes that scaling "will tend to
  inflate its value". Used as a check on the model's estates; not fitted.

## The model

The model runs through history one calendar year at a time, from a warm-up
in 1860 to 2070. The animation shows 1970–2070.

- **Rows.** Each row is an income decile among households of the same age.
  - Income at each age is *estimated* from ABS table 10.1. ABS publishes
    equivalised (person-weighted) percentiles by age band, not household
    deciles.
  - A decile's equivalised mean is taken at its middle percentile: P15 is
    halfway between P10 and P20, and so on. P5 is extrapolated, and the top
    decile is set so the ten average to the band's ABS mean.
  - Equivalised income is converted to household income by the band's mean
    disposable ÷ mean equivalised. That assumes household size is the same
    across the band.
  - Income is linear between the bands' midpoints. Rows are staggered by a
    quarter of a year so they don't move in lockstep.
- **Households.** Each row has a household born every 2.5 years, so 28 are
  alive at any time. A household's parent is the one 25 years older in the
  same row. Each year, every household:
  - *Before 65:* saves the saving share of its income. Any gift or estate
    goes into savings too. From 65 it spends its savings down evenly to 90.
  - *Renting:* buys a **starter home**, at 70% of this year's mean dwelling
    price, as soon as it has a 20% deposit and a 30-year loan's repayments,
    at the real rate, fit within the lending limit.
  - *From 10 years on, if under 65:* **trades up** to the mean dwelling in
    the first year a new 20-year loan's repayments fit. It sells the starter,
    uses savings, and rolls what it owes plus the gap into that loan. A
    household that can pay cash for the mean dwelling buys it straight away.
    A trade-up from owning outright makes the household a mortgagor again,
    so its child's gifts pause.
  - *Mortgage:* makes fixed real repayments until the loan is cleared. Gifts
    and estates don't pay it down; they go into savings.
  - *Owned outright:* gives the giving share of its income to its child
    until the child owns outright too.
  - *At 90,* dies. Its estate (its home at this year's price, plus what is
    left, less any debt) goes to its child, who is 65. If the child already
    owns outright and the grandchild (40) still rents, it goes to the
    grandchild instead.
- **House values.** An owner's home is always worth this year's price (the
  starter 70% of it), so owners' wealth rises with the market. An estate's
  home is sold, and the heir gets cash.
- **Wealth** (dot size) is savings plus home equity. There is no return on
  savings, super, shares or investment property.

## Calibration

The saving share and the lending limit are fitted on a grid. The target is
the model's 2019-20 (the average of its 2019 and 2020) against ABS 2019-20
tenure by age: renting, mortgaged and owned outright, for each of 7 age
bands. The giving share is pinned so the model's 2017–2019 gifts per
household equal the PC's.

- **Result:** save **8%** of income, a lending limit of **18%** of income,
  and give **4.8%**.
- **The 18% is at the real rate.** In first-year repayments at the average
  nominal rate (8.4%) it is about 31% of income, close to the usual bank
  test. At 2019-20 rates plus APRA's serviceability buffer (about 6%), it
  would be nearer 25%.
- **Fit:** mortgaged and outright shares from 35 up land within about 12
  points of ABS. Under-35s own too little, and over-65s own outright too
  often (65–74: 80% against 68%).
- **Checks, not fitted:**
  - Median age of first purchase, 2010–2020: 31.
  - Estates passed down: about $9,200 per household a year, 1.7× the PC's
    HILDA estimate.

The full tables, and the history by decade, are in `data/CALIBRATION.md`.

## Assumptions (not data)

- A household stays in its income decile all its life, and its children
  are in the same decile. Real incomes and families move between deciles,
  which is why the lowest two rows never buy in the model.
- Incomes are fixed at 2019-20 levels, and prices move with the
  price-to-income ratio.
- The starter home is 70% of the mean dwelling value. For scale: the
  average first home buyer loan was about $432k in December 2020 (ABS
  Lending Indicators); with a 20% deposit that is about 79% of the mean.
- At most one trade-up, from 10 years on. No offset or redraw accounts:
  spare cash sits in savings rather than cutting the interest, so mortgages
  run longer than they would. A 20% deposit, one constant real rate, a
  25-year gap between parent and child, and death at exactly 90.
- One heir per estate, with no surviving spouse, aged care costs or other
  heirs.

## Reference only

`data/VALIDATION.md` also documents the data behind earlier versions of
this animation: ABS net worth by age and decile (tables 2.1, 7.2, 10.2) and
the PC's transfers by age and wealth quintile (`pc-wealth-transfers-*`). The
current model doesn't use them, apart from the PC gift total above.
