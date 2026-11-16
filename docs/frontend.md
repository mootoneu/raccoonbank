# Frontend modules

The browser app is a set of native ES modules under `src/main/resources/static/js/`.
There is no build step: `index.html` loads the vendor scripts and then `app.js` with
`<script type="module">`, and the browser resolves the imports directly.

jQuery and D3 are vendored classic scripts loaded before the module graph, so `$` and `d3`
are globals inside every module. Everything else is imported explicitly.

## Module map

| Module | Responsibility | Main exports |
| --- | --- | --- |
| `app.js` | Application core and entry point. Owns bootstrap, navigation, initial data loading and cross-view coordination. | none (entry point) |
| `state.js` | The single shared `state` object, derived selectors and the API actions that load server data. Imports nothing. | `state`, `getCategory`, `categoryKey`, `categoryGroupId`, `groupCategory`, `adminGroups`, `loadLedger`, `refreshTransactions`, `refreshReccuring` |
| `utils.js` | Formatting, escaping, colors, dates, localStorage, toasts and small shared DOM/HTML helpers. | `money`, `esc`, `toNumber`, `categoryPalette`, `categoryChip`, `readStoredState`, `storeState`, `toast`, ... |
| `view-home.js` | Overview dashboard: totals, recent transactions, donut chart and cash-flow chart. | `initHomeView`, `renderHome`, `renderCashflow` |
| `view-spending.js` | Spending histogram, category/group filter, period navigation, legend and transaction detail panel. | `initSpendingView`, `renderSpending`, `ensureSpendingAnchors`, `restoreSpendingFilters`, `resetSpendingState` |
| `view-transactions.js` | Transaction filters, sorting, selection, bulk category editing and inline edits. | `initTransactionsView`, `renderTransactions`, `restoreTransactionFilters` |
| `view-reccuring.js` | Recurring costs for the current month and their matching transactions. The file keeps the existing `reccuring` spelling used by the API and DOM ids. | `initReccuringView`, `renderReccuring` |
| `view-admin.js` | Category creation, category id changes and category deletion. | `initAdminView`, `renderAdmin` |
| `view-import.js` | OFX upload, editable review table, duplicate marking and saving. | `initImportView`, `resetImportState` |

## Dependency direction

```
app.js
  imports state.js
  imports utils.js
  imports view-*.js
            imports state.js
            imports utils.js

utils.js imports state.js
state.js imports nothing
```

- `state.js` imports nothing, so it can be used by every other module.
- `utils.js` may import `state.js`; it must not import views or the core.
- `view-*.js` import `state.js` and `utils.js`. They never import `app.js`. The transactions view
  also imports `renderReccuring` from the recurring view, because creating a recurring cost from
  a transaction refreshes that screen; this is the only view-to-view import.
- `app.js` imports the state, the utilities and all view modules.

This keeps the graph acyclic. A view that needs the core to refresh other screens receives a
callback from `app.js` instead of importing it:

| Callback | Passed to | What the core does |
| --- | --- | --- |
| `afterChange` | `initSpendingView`, `initTransactionsView` | Reload transactions, then render home, spending and transactions. |
| `onLedgerChanged` | `initAdminView` | Reload categories/transactions/recurring, reset spending, render home and admin. |
| `onSaved` | `initImportView` | Reset spending, switch to home, reload transactions and render home. |
| `onShow` | `initImportView` | Switch to the import view. |

## Lifecycle

1. `index.html` loads jQuery, D3 and then `app.js` as a module.
2. The jQuery ready handler in `app.js` sets up the date label, calls each view's
   `init<View>View()` to bind its events, binds core navigation, and starts `loadInitialData()`.
3. `loadInitialData()` calls `loadLedger()` in `state.js`, restores the saved filters and renders
   the home view. If another view is already visible, it is rendered too.
4. Navigation functions in `app.js` (`openSpending`, `openTransactions`, ...) guard unsaved
   imports, switch views and call the relevant render function.
5. Mutations call the `state.js` API action, then the callback the core provided so that the
   affected views re-render.
6. Each view binds its own controls in `init<View>View()`; rendering functions only read the
   state and update the DOM. Keeping events out of render functions prevents duplicate handlers.

## Shared state and selectors

`state.js` holds one mutable object. Views may read and update it directly, for example
`state.editingTransactionId` or `state.transactionSort`. Derived values live in selectors:

- `getCategory(categoryId)` resolves a category or the uncategorized fallback.
- `categoryGroupId(categoryId)` returns the group a category belongs to.
- `categoryKey(categoryId, grouped)` returns the category id, or its group id when `grouped`
  is true.
- `groupCategory(groupId)` builds the display object for a category group.
- `adminGroups()` lists the groups used by the admin and transaction filters.

`loadLedger()`, `refreshTransactions()` and `refreshReccuring()` are the only frontend code that
calls `GET /api/...` for the ledger.

## View filter persistence

The Spending and Transactions views remember their filters in `localStorage`:

| Key | Contents |
| --- | --- |
| `cochonbank2.spending.filters` | range, month, year, selected category/group ids, grouping toggle |
| `cochonbank2.transactions.filters` | category, category group, min/max amount, name and description |

Each view exports a restore function that the core calls once the ledger has loaded. Saves are
guarded by `state.filtersRestored` so an early render cannot overwrite the stored values. Keep
the keys in `utils.js` (`STORAGE_KEYS`) when adding fields.

## Conventions

- Use `esc()` for every value interpolated into HTML, including attribute values.
- Use `money`/`compactMoney`/`signedMoney` and the date helpers in `utils.js` rather than
  formatting values by hand.
- Use `categoryPalette()` for category colors so text contrast stays readable.
- Put new derived data in `state.js` only when it is shared across views; otherwise keep it in
  the view that needs it.
- Add a new view by creating `view-<name>.js`, exporting `init<Name>View()` and
  `render<Name>()`, importing and calling `init<Name>View()` from `app.js`, adding the view
  container to `showView()`, and adding the navigation wiring in `bindCoreEvents()`.
- Static assets are served with `Cache-Control: no-cache`
  (`spring.web.resources.cache.cachecontrol.no-cache=true`) so that browsers revalidate the
  individual ES modules after an update.
