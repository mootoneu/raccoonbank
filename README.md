# CochonBank2

A single-user personal finance app. Spring Boot serves a jQuery + D3.js frontend, and every
transaction lives in a plain CSV file on your machine. No database, no cloud, no account.

## Features

- **Dashboard** — total balance, monthly spending and income, a 24-month earnings-vs-spending
  chart (with a 12/24/36-month switch), an all-time D3 donut chart by category, and the most
  recent saved transactions.
- **OFX import** — upload a bank statement and get an editable preview. Nothing is written
  until you press **Save all transactions**.
- **Editable review table** — every field can be changed before saving: category, type, amount,
  bank date, real date, title, description, bill id. Rows can be removed.
- **Automatic categorization** — the title is matched against `defaultcategories.csv`
  (case-insensitive, longest pattern wins) and the matching category is preselected.
- **Category colors** — the review table shows each category name with its color as the
  background and an automatically chosen readable text color.
- **Spending view** — a stacked histogram of spending by category, grouped by day, month or year.
  Click any colored segment to list the transactions behind it.
- **Plain CSV storage** — the three data files can be opened in any spreadsheet program.

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

On first launch the `data/` directory is created next to the working directory and populated
from `src/main/resources/seed/`:

| File | Contents |
| --- | --- |
| `data/transactions.csv` | your saved ledger (starts empty) |
| `data/categories.csv` | 11 sample categories |
| `data/defaultcategories.csv` | 29 sample title-matching rules |

Existing files are never overwritten, so the app can be restarted safely. Delete the `data/`
directory to start over from the seed files.

### Try it

Import [`samples/sample.ofx`](samples/sample.ofx) from the dashboard. It contains five French
bank lines, including a salary, groceries and a transfer. Review the preview, edit a cell or two,
then save.

## Build and test

```bash
mvnw.cmd test          # 23 tests: CSV, OFX parser, import mapping, services, REST flow
mvnw.cmd package       # executable jar in target/
java -jar target/cochonbank2-1.0.0.jar
```

## Data files

All files use RFC 4180 CSV (comma separated, `"` quoting). Dates are ISO `yyyy-MM-dd` in the
data files; amounts use `.` as the decimal separator.

### `transactions.csv`

```csv
Id,Category_Id,PaymentType,Amount,BankDate,RealDate,Title,Description,Bill_Id
1,1,DEBIT,-42.15,2026-10-13,2026-10-12,CARREFOUR MARKET,,0
```

Ids are assigned by the backend on save and are never reused. `Category_Id` refers to
`categories.csv`; `0` means *Uncategorized* (the synthetic category is not stored in
`categories.csv`). `RealDate` may be empty.

### `categories.csv`

```csv
Id,Name,Color
1,Groceries,#2E7D32
```

`Color` is a `#rrggbb` value. Category ids must be unique.

### `defaultcategories.csv`

```csv
Id,Category_Id,Pattern
2,1,CARREFOUR
```

When importing, the transaction title is lowercased and checked with a *starts-with* match
against each pattern. If several patterns match, the longest one wins. If none match, the
category is `0` (Uncategorized).

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
If the trailing date is missing or invalid, the whole name is kept as the title and
`RealDate` is left empty. Import warnings (encoding issues, malformed dates, unknown fields)
are shown above the preview table.

`Description` and `Bill_Id` start empty (`""` and `0`) and can be filled in during review.

## REST API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/transactions` | List saved transactions |
| `POST` | `/api/transactions` | Save a batch of drafts, returns `{"saved": n}` |
| `POST` | `/api/transactions/import` | Upload an OFX file (`multipart/form-data`, field `file`), returns drafts and warnings |
| `GET` | `/api/categories` | List categories |
| `GET` | `/api/default-categories` | List title-matching rules |

Example preview response:

```json
{
  "fileName": "sample.ofx",
  "transactions": [
    {
      "categoryId": 1,
      "paymentType": "DEBIT",
      "amount": -42.15,
      "bankDate": "2026-10-13",
      "realDate": "2026-10-12",
      "title": "CARREFOUR MARKET",
      "description": "",
      "billId": 0
    }
  ],
  "warnings": []
}
```

Example batch save:

```bash
curl -X POST http://localhost:8080/api/transactions \
  -H "Content-Type: application/json" \
  -d '[{"categoryId":1,"paymentType":"DEBIT","amount":-42.15,
        "bankDate":"2026-10-13","realDate":"2026-10-12",
        "title":"CARREFOUR MARKET","description":"","billId":0}]'
```

## Configuration

`src/main/resources/application.properties`:

```properties
cochonbank.data-directory=./data
server.port=8080
spring.servlet.multipart.max-file-size=10MB
```

Point `cochonbank.data-directory` at any absolute or relative path to use a different ledger
location.

## Project layout

```
src/main/java/com/cochonbank2/
  config/       startup, data-directory properties
  csv/          dependency-free RFC 4180 reader/writer and repositories
  domain/       Transaction, TransactionDraft, Category, DefaultCategory
  ofx/          SGML/XML OFX parser
  service/      import mapping and batch saving
  web/          REST controllers and error handling
src/main/resources/
  static/       index.html, app.css, app.js, vendor jQuery + D3
  seed/         initial CSV files
src/test/       unit and HTTP integration tests
samples/        sample.ofx for a demo import
```

## Notes

- This is a single-user app; there is no authentication. Run it on your own machine and do not
  expose it to the internet.
- The frontend assets are vendored locally, so the app works fully offline.
