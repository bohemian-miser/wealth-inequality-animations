# Sources and method

Each number in the animation either comes from a table below or follows from
one of the named assumptions at the end. `scripts/build_data.py` reads the
raw files in `data/raw/` (downloaded exactly as published) and writes
`src/data.generated.js`. `data/VALIDATION.md` checks the result against the
published figures.

## Data

### ABS: Household Income and Wealth, Australia, 2019-20

Australian Bureau of Statistics, Survey of Income and Housing 2019-20,
released 28 April 2022. At the time of writing (October 2026) this is still
the ABS's latest release in the series.
<https://www.abs.gov.au/statistics/economy/finance/household-income-and-wealth-australia/2019-20>
Licence: CC BY 4.0.

| File | Table | Used for |
|---|---|---|
| `abs-sih-2019-20-10.xlsx` | 10.2 | Mean and median net worth by age of reference person (15–24 … 75+) |
| | 10.3 | Number of households by age |
| `abs-sih-2019-20-2.xlsx` | 2.1 | Net worth P10–P90, quintile means, 2019-20 column |
| `abs-sih-2019-20-7.xlsx` | 7.2 | Cash on hand by net worth quintile: accounts with financial institutions plus offset accounts |

### Productivity Commission: Wealth transfers and their economic effects

Research paper, December 2021, using HILDA Restricted Release 19. Amounts
are in 2018 dollars.
<https://www.pc.gov.au/inquiries-and-research/wealth-transfers>
Licence: CC BY 4.0. The chart data workbook is `pc-wealth-transfers-chart-data.xlsx`
and the paper itself is `pc-wealth-transfers-2021.pdf`.

| Figure | Used for |
|---|---|
| Overview fig. 3 | Share of gifts and of inheritances received at each age (15–19 … 75–79) |
| 1.4 | Average inheritance by recipient's age |
| 1.10 | Average gift by recipient's age (none reported past 54; the 50–54 value is carried on) |
| 1.3 | Inheritances received in 2018-19: 405,884, worth $50.4B |
| 1.9 | Gifts from parents in 2018-19: 1,535,371; all gifts worth $13.8B |
| 2.1 | Share of each wealth quintile who inherited, and the average inheritance among them |
| 2.3 | Share of each wealth quintile who received a gift, and the average gift among them |
| 2.10 | Not used: rank-rank persistence between parents' and children's wealth (see "Own row" below) |
| Overview fig. 4 | Validation only: transfers by quintile in dollars and as a share of wealth |

### Cross-checks only

ACOSS & UNSW Sydney, *Inequality in Australia 2024: Who is affected and how*
(April 2024, ABS data for 2022-23). Its figures are compared in
`VALIDATION.md` but not fitted to, since they come three years after the ABS
survey above: the top 10% averaging $5.2M; under-35s in the lowest 60%
averaging $80k and in the top 10% $2M; the top sixth of older households
holding 53% of older households' wealth.
<https://www.unsw.edu.au/newsroom/news/2024/04/wealth-gap-widening-new-report-acoss>

## Method

**Wealth by row and age.** Each ABS age band gets a shifted lognormal,
X = exp(μ + σZ) − c. For any shift c, the band's published mean and median fix
μ and σ, so every band matches ABS exactly. The seven shifts are then fitted
so the bands, weighted by their household counts, come closest to ABS's
national P10–P90 and quintile means. Every sampled household is then moved
to the national ABS quantile of its rank in that mix. Below P20 the quantile
function is linear (net worth crosses zero); from P20 to P90 it is
log-linear; above P90 it is a Pareto tail. The bottom (P0) and the tail are
set so the lowest and highest quintile means are ABS's. The animation's rows
are the decile means within each age band, interpolated linearly between the
bands' midpoints.

**Transfers.** Each year, each dot receives an inheritance with probability
405,884 ÷ 9,732,400 households, and a gift with probability 1,535,371 ÷ the
same. HILDA counts people, so this mixes people and households. A transfer
draws:

1. The recipient's age, from the PC's age shares (15–19 is folded into age
   20, where the grid starts).
2. The recipient's wealth quintile, in proportion to the share of that
   quintile who received one. The decile within the quintile is chosen at
   random. Caveat: the PC's quintiles are of equivalised wealth across all
   ages, while the rows are deciles within an age.
3. The amount: the PC's average at that age × the quintile's average among
   recipients ÷ the recipient-weighted mean of those averages. The age
   averages are thus preserved, and the quintile spread comes from the PC.
4. The giver: a dot 30 years older (capped at 89) in the recipient's own row,
   always older than the recipient. Money only ever flows from older to younger.

Dot sizes are always ABS's figures. The gold core shows what a household has
received in the run so far. It doesn't add to the dot's size, because the
ABS figures already include whatever was received. A one-lifetime warm-up
runs before anything is drawn.

## Assumptions (not data)

- **Generation gap: 30 years** between a parent and the child they give to.
- **The squeeze.** A parent facing extra costs of S a year gives a gift
  scaled by max(0, 1 − S ÷ their quintile's average cash on hand). That cash
  is ABS table 7.2: $9.3k, $29.8k, $52.6k, $83.4k and $232.7k, bottom to top.
  Inheritances are not squeezed. The squeeze is a what-if built on real cash
  buffers, not a measured response.
- **Own row.** Each row stands for a line of families, so a parent gives
  only to a child in the same decile. Real families are less tied than that:
  the PC (figure 2.10, Siminski & Yu 2021) measures a rank-rank persistence
  of 0.09 between parents' and children's wealth when the child is 20, rising
  to 0.49 from 40. The animation keeps each family in its lane for
  readability. The amounts each row receives still come from the PC's
  quintile data, as before.
- **Equal dots per age.** The grid follows cohorts and leaves out mortality,
  so older ages are over-represented compared with the real population.
- **Same-age deciles.** A dot keeps its decile all its life. In reality
  households move between deciles.
