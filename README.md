# CochonBank2

A single-user personal finance app. Spring Boot serves a small ES-module frontend built on
jQuery and D3.js, and every transaction lives in a plain CSV file on your machine. No database,
no cloud, no account.

## Features

- **Dashboard** — total balance, monthly spending and income, a 24-month earnings-vs-spending
  chart (with a 12/24/36-month switch), an all-time D3 donut chart by category, and the most
  recent saved transactions.
- **OFX import** — upload a bank statement and get an editable preview. Nothing is written
  until you press **Save all transactions**.
- **Editable review table** — every field can be changed before saving: category, type, amount,
  bank date, real date, title, description, bill id. Bill ids are free-form strings
  (`INV-2026-01`, `42`, …). Rows can be removed.
- **Duplicate highlighting** — statements that already exist in `transactions.csv` are tinted
  amber and marked **Saved** in the review table. A row counts as a duplicate when its amount,
  bank date and title all match a saved transaction; titles are compared trimmed, with repeated
  spaces collapsed. Duplicates remain editable and can still be saved if you really want them.
  The **Discard saved** button removes every **Saved** row from the review table in one click.
- **Automatic categorization** — the title is matched against `defaultcategories.csv`
  (case-insensitive, longest pattern wins) and the matching category is preselected. When a
  rule has a description, it is copied onto the draft if the description is still empty. In the
  review table, the small **+** button on a line saves that line's title, selected category and
  description (when filled) as a new rule for future imports; the rule is immediately applied
  to every draft line whose title starts with it, ignoring case. A rule needs a real category
  (not *Uncategorized*) and is refused when an identical title already has one.
- **Category colors** — the category dropdown shows a colored line per option, and the review
  table shows each category name with its color as the background and an automatically chosen
  readable text color. A handful of mid-tone colors are nudged just enough to keep the text at
  a 4.5:1 contrast ratio.
- **Spending view** — a stacked histogram of spending by category, grouped by day, month or year.
  Categories are ordered by id in the legend and the stack. Click any colored segment to list
  the transactions behind it. The **category filter** shows only the selected categories, which
  can be combined freely; its options are colored chips in category id order. The **By category
  group** checkbox aggregates the histogram, legend, totals and filter by `GroupId`, using each
  group root's name and color, so the whole `Loisir` group appears as one segment.
- **Recurring costs** — keep the expected day, title, amount and category of your regular
  costs in `reccuringcosts.csv`. The **Recurring** view compares them with the matching
  transactions saved for the current month, with totals for expected and spent amounts.
  Costs can be added, edited and deleted from the view.
- **Rolling backups** — every application start copies the four CSV files into
  `data/backup/backup-yyyyMMdd-HHmmss-SSS/` and keeps the three most recent snapshots.
- **Plain CSV storage** — the four data files can be opened in any spreadsheet program.

## Requirements

- Java 21 or newer (the project is built with `java.version=21`)
- No Maven installation needed — the Maven wrapper is included.

## Run

```bash
cd cochonbank2
# Windows
mvnw.cmd spring-boot:run

# macOS / Linux
./mvnw spring-boot:run
```

Then open <http://localhost:8080>.

## Overview cash flow chart

The dashboard shows monthly earnings (positive amounts) and spending (negative amounts) as
grouped bars ending with the current month. The default window is 24 months; use the **12m**,
**24m** or **36m** switch to change it. The card totals earned, spent and net for the selected
window, and hovering a month shows its earnings, spending and net.

## Spending view

Open **Spending** in the header, or **View all spending** on the dashboard chart. The histogram
stacks the selected period's expenses by category:

| Filter | Each bar is | Period navigation |
| --- | --- | --- |
| **By month** | one day of the selected month | previous / next month |
| **By year** | one month of the selected year | previous / next year |
| **All time** | one year | none |

Hover a segment for its amount and transaction count. Click a segment (or focus it and press
Enter/Space) to open a detail panel listing those transactions with their bank date, real date,
type, description, bill id and amount.

Tick **By category group** to aggregate everything by the category's `GroupId` instead of its
`Id`: each bar has one segment per group, named and colored after the group root category, and
the totals, top category and detail panel cover every category in the group. Unticking it
returns to one segment per category.

The **All categories** control under the view title opens a multi-select menu. Each option is a
chip using the category color as its background, listed in category id order. Selecting one or
more chips restricts the totals, legend and histogram to those categories while the period
navigation keeps covering the whole ledger. In group mode the control lists groups instead and
is labelled **All groups**. **Reset** (or the button in an empty histogram) clears the filter.

## Recurring view

Open **Recurring** in the header to compare your expected regular costs with what you have
actually spent during the current month. The three cards above the table show the **Total
Expected** and **Total Spent** sums and the **Total Remaining** difference, and each row lists
the expected day, title, category chip, expected amount and spent amount.

The spent amount is the sum of `Transactions.Amount` for transactions whose bank date falls in
the current month and whose title matches the recurring cost's title. Titles are compared
trimmed, with repeated spaces collapsed and ignoring case.

Use the form to add a cost, the pencil button to edit it, or the bin button to delete it. A
title must be unique among recurring costs because it is what links a cost to its transactions.

On first launch the `data/` directory is created next to the working directory and populated
from `src/main/resources/seed/`:

| File | Contents |
| --- | --- |
| `data/transactions.csv` | your saved ledger (starts empty) |
| `data/categories.csv` | 11 sample categories |
| `data/defaultcategories.csv` | 29 sample title-matching rules |
| `data/reccuringcosts.csv` | your expected recurring costs (starts empty) |

Existing files are never overwritten, so the app can be restarted safely. Delete the `data/`
directory to start over from the seed files.

## Startup backups

Each time the application starts, the current data files are copied into a timestamped folder:

```
data/backup/backup-20261026-143012-412/
  transactions.csv
  categories.csv
  defaultcategories.csv
  reccuringcosts.csv
```

Only the three most recent snapshots are kept; older ones are deleted automatically. The backup
runs before any data file is created, so a fresh install with no data yet does not produce an
empty snapshot. A copy failure stops startup instead of risking data loss. To restore a backup,
stop the app and copy the four files from the snapshot back into `data/`.

### Try it

Import [`samples/sample.ofx`](samples/sample.ofx) from the dashboard. It contains five French
bank lines, including a salary, groceries and a transfer. Review the preview, edit a cell or two,
then save.

## Legacy ledger migration

A ledger written by the first CochonBank version uses eight columns
(`Id,…,Title,Bill_Id`) and dates such as `12/31/2016 00:00:00`. On startup, if that
legacy header is detected, the app backs the file up first and then rewrites it in the current
nine-column format: an empty `Description` column is added and both dates are converted to
ISO `yyyy-MM-dd`. When a legacy row has no real date, the bank date is used, so every row
follows the same real-date rule as new imports. Quoted titles, accents and bill ids are
preserved. If a date cannot be parsed, startup stops and the original file is left untouched.

Rules written before the rule description existed use three columns (`Id,Category_Id,Pattern`).
They are backed up and rewritten with an empty `Description` column at startup; current files
are left untouched.

Categories written before explicit groups use three columns (`Id,Name,Color`) and were grouped
implicitly by the tens of their id (40 and 43 shared group 4). They are backed up and rewritten
with `GroupId`, `SubId` and `GroupName`, and every category id is multiplied by 10:

```text
43,Ordinateur,#32bdbc   ->   430,4,30,Loisir,Ordinateur,#32bdbc
```

The same migration multiplies the `Category_Id` values in `transactions.csv` and
`defaultcategories.csv`, so existing transactions and rules keep pointing at the same category.
Blank ids stay blank and files already in the current format are left untouched.

## Build and test

```bash
mvnw.cmd test          # 76 tests: CSV, OFX parser, import mapping, backups, migration, services, REST flow
mvnw.cmd package       # executable jar in target/
java -jar target/cochonbank2-1.0.0.jar
```

## Data files

All files use RFC 4180 CSV (comma separated, `"` quoting). Dates are ISO `yyyy-MM-dd` in the
data files; amounts use `.` as the decimal separator.

### `transactions.csv`

```csv
Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,Description,Bill_Id
1,10,DEBIT,-42.15,2026-10-13,2026-10-12,CARREFOUR MARKET,,INV-2026-01
```

Ids are assigned by the backend on save and are never reused. `Category_Id` refers to
`categories.csv`; `0` means *Uncategorized* (the synthetic category is not stored in
`categories.csv`). `RealDate` is never empty: when the bank statement has no usable real date,
it is set to `BankDate`. `Bill_Id` is free-form text and may be empty; older files used `0` to
mean "no bill", which is still read as empty.

### `categories.csv`

```csv
Id,GroupId,SubId,GroupName,Name,Color
430,4,30,Loisir,Ordinateur,#32bdbc
```

Each category belongs to an explicit group. `GroupId` identifies the group, `SubId` its position
inside the group and `Id` equals `GroupId * 100 + SubId`. The category with `SubId` `0` is the
group root, and `GroupName` repeats that root's name on every row: `400,Loisir` and
`430,Ordinateur` both carry the group name `Loisir`. `Color` is a `#rrggbb` value. Category ids
must be unique.

### `defaultcategories.csv`

```csv
Id,Category_Id,Pattern,Description
2,1,CARREFOUR,Weekly shop
```

When importing, the transaction title is normalized (trimmed, repeated spaces collapsed) and
checked with a case-insensitive *starts-with* match against each pattern. If several patterns
match, the longest one wins. If none match, the category is `0` (Uncategorized). A non-empty
`Description` is copied onto drafts whose description is still empty.

### `reccuringcosts.csv`

```csv
Day,Title,Amount,Category_Id
5,RENT,-800.00,100
```

`Day` is the typical day of the month (`1`–`31`), `Title` is matched against transaction titles
and must be unique (ignoring case), `Amount` is the expected amount and `Category_Id` refers to
`categories.csv`. Amounts can be negative like their matching expenses.

## OFX mapping

The importer accepts both SGML (OFX 1.x) and XML (OFX 2.x) statements, and detects the file
encoding from the OFX header.

| OFX field | Transaction field |
| --- | --- |
| `TRNTYPE` | `PaymentType` |
| `DTPOSTED` | `BankDate` |
| `TRNAMT` | `Amount` |
| `NAME` | `Title` + `RealDate` |

`NAME` is expected to end with a date in `dd/MM/yy` form, e.g. `CARREFOUR MARKET 12/10/26`.
That date becomes `RealDate` and is removed from the title. A two-digit year is read as `20yy`.
If the trailing date is missing or invalid, the whole name is kept as the title and `RealDate`
falls back to `BankDate`. Import warnings (encoding issues, malformed dates, unknown fields)
are shown above the preview table.

`Description` and `Bill_Id` start empty (`""`) and can be filled in during review. Bill ids may
contain any text, not only digits.

## REST API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/transactions` | List saved transactions |
| `POST` | `/api/transactions` | Save a batch of drafts, returns `{"saved": n}` |
| `POST` | `/api/transactions/import` | Upload an OFX file (`multipart/form-data`, field `file`), returns drafts and warnings |
| `GET` | `/api/categories` | List categories |
| `GET` | `/api/default-categories` | List title-matching rules |
| `POST` | `/api/default-categories` | Create a rule from `{"categoryId": n, "pattern": "TITLE", "description": "optional note"}` |
| `GET` | `/api/reccuring-costs` | List recurring costs |
| `POST` | `/api/reccuring-costs` | Create a cost from `{"day": 5, "title": "RENT", "amount": -800.00, "categoryId": 100}` |
| `PUT` | `/api/reccuring-costs/{title}` | Update the cost identified by its current title |
| `DELETE` | `/api/reccuring-costs/{title}` | Delete the cost identified by its title |

Example preview response:

```json
{
  "fileName": "sample.ofx",
  "transactions": [
    {
      "categoryId": 10,
      "paymentType": "DEBIT",
      "amount": -42.15,
      "bankDate": "2026-10-13",
      "realDate": "2026-10-12",
      "title": "CARREFOUR MARKET",
      "description": "",
      "billId": ""
    }
  ],
  "warnings": []
}
```

Example batch save:

```bash
curl -X POST http://localhost:8080/api/transactions \
  -H "Content-Type: application/json" \
  -d '[{"categoryId":10,"paymentType":"DEBIT","amount":-42.15,
        "bankDate":"2026-10-13","realDate":"2026-10-12",
        "title":"CARREFOUR MARKET","description":"","billId":"INV-42"}]'
```

## Configuration

`src/main/resources/application.properties`:

```properties
cochonbank.data-directory=./data
server.port=8080
spring.servlet.multipart.max-file-size=10MB
spring.web.resources.cache.cachecontrol.no-cache=true
```

Point `cochonbank.data-directory` at any absolute or relative path to use a different ledger
location. The cache setting makes browsers revalidate the ES modules after an update.

## Frontend

The UI is split into native ES modules under `src/main/resources/static/js/`; there is no build
step. `app.js` is the entry point and application core, each screen lives in `view-<name>.js`,
shared state and selectors are in `state.js`, and formatting/storage/DOM helpers are in
`utils.js`. See [docs/frontend.md](docs/frontend.md) for the module map, dependency rules and
the checklist for adding a view.

## Project layout

```
src/main/java/com/cochonbank2/
  config/       startup, data-directory properties, rolling backups
  csv/          dependency-free RFC 4180 reader/writer and repositories
  domain/       Transaction, TransactionDraft, Category, DefaultCategory, ReccuringCosts
  ofx/          SGML/XML OFX parser
  service/      import mapping and batch saving
  web/          REST controllers and error handling
src/main/resources/
  static/       index.html, app.css, js/ modules, vendor jQuery + D3
  seed/         initial CSV files
src/test/       unit and HTTP integration tests
samples/        sample.ofx for a demo import
docs/           frontend module guide
```

## Notes

- This is a single-user app; there is no authentication. Run it on your own machine and do not
  expose it to the internet.
- The frontend assets are vendored locally, so the app works fully offline.
- The frontend uses native ES modules and must be served over HTTP. Run the app with the command
  above instead of opening `index.html` from the filesystem.
