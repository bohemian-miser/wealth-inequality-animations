# Wealth inequality animations

Animations of how wealth is held and passed on in Australia. Plain HTML and
canvas: no build step and no dependencies.

```bash
python3 -m http.server 8000   # then open http://localhost:8000/
```

The page loads ES modules, so open it through a local server like this one,
not as a `file://` URL. `?squeeze=0.8` starts it with the squeeze already on.

## 1. Passing it back (`src/lifetimes.js`)

A grid of households. Each row is a wealth decile, with the richest at the
top. Dots drift left to right as their households age from 20 to 90, then
start again at 20 as a new household. A dot's area is its wealth. From 58 on,
a household with more than it needs to keep sends sparkles of the surplus back
to a household aged 22–48 in its own row. That stands for gifts, help with a
deposit, and inheritances.

The **squeeze** slider raises how much an older household has to keep first,
from $25k up to $1M (rents, rates, living costs, aged care). The lower rows
lose their surplus first and stop passing anything back, while the top rows
hardly notice. The gauge on the right shows each row's flow. Young dots that
were helped take on a warm tint.

## Data

These are illustrative models calibrated to published figures, not
microsimulations. The numbers and how they are interpolated are in
`src/data.js`.

- ACOSS & UNSW Sydney, *Inequality in Australia 2024: Who is affected and how*
  (April 2024; ABS Survey of Income and Housing 2022-23). Figures used: the top
  10% of households average $5.2M and hold 44% of all wealth; the lowest 60%
  average $343k; households under 35 average $410k, 35–64 $1.26M, and over 65
  $1.58M. Also used: the 2018 edition's figure that the top 20% hold about 100×
  the bottom 20%.
  [UNSW summary](https://www.unsw.edu.au/newsroom/news/2024/04/wealth-gap-widening-new-report-acoss)
- Productivity Commission, *Wealth transfers and their economic effects*
  (December 2021). About $1.5 trillion was passed on over two decades, about
  90% of it as inheritances. Givers are mostly older and receivers younger.
  [pc.gov.au](https://www.pc.gov.au/inquiries-and-research/wealth-transfers)

Not modelled yet: transfers that cross rows, house prices, super, and the
PC's finding that transfers, *as a share of what the receiver already has*,
are larger lower down.
