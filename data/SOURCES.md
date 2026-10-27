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

## Calibration

The fit is a Nelder–Mead search over nine parameters, with bounds that keep
each one plausible (for example, a lending limit of 25–40%). It targets five
groups:
- Census ownership by age, 1971–2021;
- 2019-20 tenure by age;
- older owners, 1997–2020;
- 2019-20 tenure by income quintile;
- first home buyers' average age (1996–2012: 32.5; 2015–2018: 34.8), which
  counts double.

Result:

| Parameter | Value |
|---|---|
| Lending limit | about 30% of income (27% before 1986) |
| First-home deposit | 12% |
| Saving | 17.7% of income above about $54k |
| Help to buy | 9.9% of the parent's wealth, once; $1,280 per household a year against the PC's $1,214 |

Fit, first buyers' mean age: 31.0 (1996–2012) and 33.9 (2015–2018).

Estates passed down come to about $5,400 per household a year, against the
PC's $5,300 (HILDA).

The full tables, errors and checks are in `data/CALIBRATION.md`.

## Known gaps

- 45–54-year-olds own outright too rarely in the model (about 5–10%, against
  ABS's 43% in 1997 falling to 15% in 2019-20). Trade-ups keep them mortgaged.
- Too few high-income households rent: 6% of the top income fifth, against
  ABS's 25%.
- The early 1970s show more young owners than the Census.
- Every household has one row and one child in it. After 2025, prices and
  rates are held (a what-if).

## Reference only

`data/VALIDATION.md` also documents the data behind earlier versions of
this animation: ABS net worth by age and decile, and the PC's transfers by
age and wealth quintile. The current model doesn't use them.
