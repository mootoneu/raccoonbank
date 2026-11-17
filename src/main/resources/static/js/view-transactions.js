/* ==========================================================================
   RaccoonBank - Transactions view
   Filtering, sorting, selection, bulk editing and inline transaction edits.
   ========================================================================== */

import {
    state, adminGroups, CATEGORY_NONE, categoryGroupId, getCategory, refreshReccuring
} from './state.js';
import {
    STORAGE_KEYS, categoryChip, errorDetail, esc, fillSelect, formatDate, money,
    normalizeReccuringTitle, readStoredState, renderDetailEditRow,
    saveTransactionEdit, storeState, toNumber, toast
} from './utils.js';
import { renderReccuring } from './view-reccuring.js';

const TRANSACTION_SORTERS = {
    date: transaction => String(transaction.bankDate || ''),
    name: transaction => String(transaction.title || ''),
    description: transaction => String(transaction.description || ''),
    ref: transaction => String(transaction.billId || ''),
    category: transaction => getCategory(transaction.categoryId).name,
    amount: transaction => toNumber(transaction.amount)
};

/* --------------------------------------------------------------------------
   Filtering and sorting
   -------------------------------------------------------------------------- */

function scheduleTransactionsRender() {
    window.clearTimeout(state.transactionFilterTimer);
    state.transactionFilterTimer = window.setTimeout(renderTransactions, 120);
}

function readTransactionFilters() {
    const numberOf = selector => {
        const raw = String($(selector).val() || '').trim();
        const value = Number(raw);
        return raw === '' || !Number.isFinite(value) ? null : value;
    };
    const textOf = selector => String($(selector).val() || '').trim().toLowerCase();
    const dateOf = selector => {
        const value = String($(selector).val() || '').trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
    };
    const category = String($('#tx-filter-category').val() || '');
    const group = String($('#tx-filter-group').val() || '');
    return {
        category: category === '' ? null : Number(category),
        group: group === '' ? null : Number(group),
        min: numberOf('#tx-filter-min'),
        max: numberOf('#tx-filter-max'),
        name: textOf('#tx-filter-name'),
        description: textOf('#tx-filter-description'),
        start: dateOf('#tx-filter-start'),
        end: dateOf('#tx-filter-end')
    };
}

/** Amount limits apply to the absolute value, so spending and income are both covered. */
function filterTransactions(list, filters) {
    return list.filter(transaction => {
        if (filters.category !== null && (Number(transaction.categoryId) || 0) !== filters.category) {
            return false;
        }
        if (filters.group !== null && categoryGroupId(transaction.categoryId) !== filters.group) {
            return false;
        }
        const amount = Math.abs(toNumber(transaction.amount));
        if (filters.min !== null && amount < filters.min) {
            return false;
        }
        if (filters.max !== null && amount > filters.max) {
            return false;
        }
        const bankDate = String(transaction.bankDate || '');
        if (filters.start !== null && bankDate < filters.start) {
            return false;
        }
        if (filters.end !== null && bankDate > filters.end) {
            return false;
        }
        if (filters.name && !String(transaction.title || '').toLowerCase().includes(filters.name)) {
            return false;
        }
        return !filters.description
            || String(transaction.description || '').toLowerCase().includes(filters.description);
    });
}

function sortTransactions(list) {
    const sort = state.transactionSort;
    const valueOf = TRANSACTION_SORTERS[sort.key];
    const sign = sort.direction === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
        const left = valueOf(a);
        const right = valueOf(b);
        let compared;
        if (typeof left === 'string') {
            compared = left.localeCompare(right, 'en', { sensitivity: 'base' });
        } else {
            compared = left < right ? -1 : (left > right ? 1 : 0);
        }
        return (compared || Number(a.id) - Number(b.id)) * sign;
    });
}

function sortTransactionsBy(key) {
    const sort = state.transactionSort;
    if (sort.key === key) {
        sort.direction = sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.transactionSort = {
            key: key,
            direction: key === 'date' || key === 'amount' ? 'desc' : 'asc'
        };
    }
    renderTransactions();
}

function renderSortIndicators() {
    const sort = state.transactionSort;
    $('#tx-table th[data-sort]').each(function () {
        const active = this.getAttribute('data-sort') === sort.key;
        const ascending = sort.direction === 'asc';
        $(this).attr('aria-sort', active ? (ascending ? 'ascending' : 'descending') : 'none');
        $(this).find('.tx-sort-mark').text(active ? (ascending ? '▲' : '▼') : '');
    });
}

function resetTransactionFilters() {
    $('#transactions-view .tx-filter').val('');
    renderTransactions();
}

function ensureTransactionOptions() {
    const categories = state.categories
        .filter(category => Number(category.id) !== CATEGORY_NONE.id)
        .slice()
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map(category => ({ value: String(category.id), label: category.name }));
    const uncategorized = { value: '0', label: 'Uncategorized' };

    fillSelect($('#tx-filter-category'),
        [{ value: '', label: 'All categories' }, uncategorized].concat(categories));
    fillSelect($('#tx-filter-group'),
        [{ value: '', label: 'All groups' }, uncategorized].concat(adminGroups().map(group => ({
            value: String(group.id),
            label: group.label
        }))));
    fillSelect($('#tx-bulk-category'),
        [{ value: '', label: 'Choose a category…' }, uncategorized].concat(categories));
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */

function renderTransactions() {
    ensureTransactionOptions();
    const visible = sortTransactions(filterTransactions(state.transactions, readTransactionFilters()));
    state.transactionVisible = visible.map(transaction => Number(transaction.id));
    $('#tx-body').html(visible.map(renderTransactionRow).join(''));
    $('#tx-count').text(visible.length + ' of ' + state.transactions.length
        + (state.transactions.length === 1 ? ' transaction' : ' transactions'));
    $('#tx-empty').prop('hidden', visible.length > 0);
    renderSortIndicators();
    updateTransactionSelectionUi();
    saveTransactionFilters();
}

function renderTransactionRow(transaction) {
    const id = Number(transaction.id);
    if (id === state.editingTransactionId) {
        return renderDetailEditRow(transaction, 8);
    }
    const selected = state.transactionSelection.has(id);
    const amount = toNumber(transaction.amount);
    const description = String(transaction.description || '');
    return '<tr class="tx-row' + (selected ? ' is-selected' : '') + '" data-id="' + id + '">'
        + '<td class="col-select"><input type="checkbox" class="tx-select" data-id="' + id + '"'
            + (selected ? ' checked' : '') + ' aria-label="Select ' + esc(transaction.title) + '"></td>'
        + '<td class="date-cell">' + esc(formatDate(transaction.bankDate)) + '</td>'
        + '<td><div class="tx-title" title="' + esc(transaction.title) + '">' + esc(transaction.title) + '</div></td>'
        + '<td><div class="tx-sub" title="' + esc(description) + '">' + esc(description) + '</div></td>'
        + '<td class="tx-ref">' + esc(transaction.billId || '') + '</td>'
        + '<td>' + categoryChip(getCategory(transaction.categoryId)) + '</td>'
        + '<td class="align-right"><span class="amount ' + (amount < 0 ? 'negative' : 'positive') + '">'
            + esc(money.format(amount)) + '</span></td>'
        + '<td class="col-action"><div class="tx-actions">'
            + '<button type="button" class="icon-btn tx-reccuring-btn" data-id="' + id + '"'
            + ' aria-label="Set recurring cost for ' + esc(transaction.title) + '" title="Set recurring">'
            + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14'
            + 'M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" fill="none" stroke="currentColor"'
            + ' stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg></button>'
            + '<button type="button" class="icon-btn tx-edit-btn" data-id="' + id + '"'
            + ' aria-label="Edit transaction ' + esc(transaction.title) + '" title="Edit transaction">'
            + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"'
            + ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"'
            + ' stroke-linecap="round"/></svg></button>'
            + '</div></td>'
        + '</tr>';
}

async function openReccuringFromTransaction(id, button) {
    const transaction = state.transactions.find(item => Number(item.id) === Number(id));
    if (!transaction) {
        toast('That transaction could not be found.', 'error');
        return;
    }
    const parts = String(transaction.bankDate || '').split('-');
    const day = Number(parts[2]);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
        toast('That transaction has no valid bank date to copy the day from.', 'error');
        return;
    }
    const payload = {
        day: day,
        title: normalizeReccuringTitle(transaction.title),
        amount: toNumber(transaction.amount),
        categoryId: Number(transaction.categoryId) || 0
    };
    const $button = $(button || []);
    $button.prop('disabled', true).attr('aria-busy', 'true');
    try {
        const created = await $.ajax({
            url: '/api/reccuring-costs',
            method: 'POST',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify(payload)
        });
        const title = created && created.title ? created.title : payload.title;
        toast('Recurring cost “' + title + '” added.', 'success');
        await refreshReccuring();
        renderReccuring();
    } catch (xhr) {
        toast(errorDetail(xhr), 'error');
    } finally {
        $button.prop('disabled', false).removeAttr('aria-busy');
    }
}

/* --------------------------------------------------------------------------
   Selection and bulk editing
   -------------------------------------------------------------------------- */

function toggleTransactionSelection(id, selected) {
    if (selected) {
        state.transactionSelection.add(id);
    } else {
        state.transactionSelection.delete(id);
    }
    updateTransactionSelectionUi();
}

function setVisibleSelection(selected) {
    state.transactionVisible.forEach(id => {
        if (selected) {
            state.transactionSelection.add(id);
        } else {
            state.transactionSelection.delete(id);
        }
    });
    updateTransactionSelectionUi();
}

function reverseVisibleSelection() {
    state.transactionVisible.forEach(id => {
        if (state.transactionSelection.has(id)) {
            state.transactionSelection.delete(id);
        } else {
            state.transactionSelection.add(id);
        }
    });
    updateTransactionSelectionUi();
}

function updateTransactionSelectionUi() {
    const selection = state.transactionSelection;
    const visible = state.transactionVisible;
    const visibleSet = new Set(visible);
    const visibleSelected = visible.filter(id => selection.has(id)).length;
    let hidden = 0;
    selection.forEach(id => {
        if (!visibleSet.has(id)) {
            hidden += 1;
        }
    });

    $('#tx-selected-count').text(selection.size + ' selected'
        + (hidden ? ' (' + hidden + ' hidden by the filters)' : ''));
    $('#tx-select-all-header')
        .prop('checked', visible.length > 0 && visibleSelected === visible.length)
        .prop('indeterminate', visibleSelected > 0 && visibleSelected < visible.length);
    $('#tx-select-visible, #tx-reverse-selection').prop('disabled', visible.length === 0);
    $('#tx-clear-selection').prop('disabled', selection.size === 0);
    $('#tx-bulk-apply').prop('disabled', selection.size === 0 || $('#tx-bulk-category').val() === '');
    $('#tx-body .tx-row').each(function () {
        const selected = selection.has(Number(this.getAttribute('data-id')));
        $(this).toggleClass('is-selected', selected);
        $(this).find('.tx-select').prop('checked', selected);
    });
}

async function applyBulkCategory() {
    const ids = Array.from(state.transactionSelection);
    const choice = String($('#tx-bulk-category').val() || '');
    if (!ids.length || choice === '') {
        return;
    }
    const categoryId = Number(choice);
    const label = getCategory(categoryId).name;
    const count = ids.length + (ids.length === 1 ? ' transaction' : ' transactions');
    if (!window.confirm('Set the category of ' + count + ' to “' + label + '”?')) {
        return;
    }

    const $button = $('#tx-bulk-apply');
    $button.prop('disabled', true).attr('aria-busy', 'true');
    try {
        const result = await $.ajax({
            url: '/api/transactions/category',
            method: 'PUT',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify({ ids: ids, categoryId: categoryId })
        });
        state.transactionSelection.clear();
        toast(result.updated + (result.updated === 1 ? ' transaction' : ' transactions')
            + ' set to “' + label + '”.', 'success');
        await afterChange();
    } catch (xhr) {
        toast(errorDetail(xhr), 'error');
    } finally {
        $button.removeAttr('aria-busy');
        updateTransactionSelectionUi();
    }
}

/* --------------------------------------------------------------------------
   Saved filter state
   -------------------------------------------------------------------------- */

function saveTransactionFilters() {
    if (!state.filtersRestored.transactions) {
        return;
    }
    storeState(STORAGE_KEYS.transactionFilters, {
        category: String($('#tx-filter-category').val() || ''),
        group: String($('#tx-filter-group').val() || ''),
        min: String($('#tx-filter-min').val() || ''),
        max: String($('#tx-filter-max').val() || ''),
        name: String($('#tx-filter-name').val() || ''),
        description: String($('#tx-filter-description').val() || ''),
        start: String($('#tx-filter-start').val() || ''),
        end: String($('#tx-filter-end').val() || '')
    });
}

function restoreTransactionFilters() {
    state.filtersRestored.transactions = true;
    const stored = readStoredState(STORAGE_KEYS.transactionFilters);
    if (!stored) {
        return;
    }
    ensureTransactionOptions();
    const restoreSelect = (selector, value) => {
        const $select = $(selector);
        if (typeof value === 'string' && value !== ''
                && $select.find('option').filter(function () {
                    return this.value === value;
                }).length) {
            $select.val(value);
        }
    };
    restoreSelect('#tx-filter-category', stored.category);
    restoreSelect('#tx-filter-group', stored.group);
    ['min', 'max', 'name', 'description', 'start', 'end'].forEach(key => {
        if (typeof stored[key] === 'string') {
            $('#tx-filter-' + key).val(stored[key]);
        }
    });
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

let afterChange = async () => {};

export function initTransactionsView(options) {
    afterChange = (options && options.afterChange) || afterChange;

    $('#transactions-view .tx-filter').on('input change', scheduleTransactionsRender);
    $('#tx-filter-reset').on('click', resetTransactionFilters);
    $('#transactions-view').on('click', '.tx-sort', function () {
        sortTransactionsBy(this.closest('th').getAttribute('data-sort'));
    });
    $('#tx-select-all-header').on('change', function () {
        setVisibleSelection(this.checked);
    });
    $('#tx-select-visible').on('click', function () {
        setVisibleSelection(true);
    });
    $('#tx-reverse-selection').on('click', reverseVisibleSelection);
    $('#tx-clear-selection').on('click', function () {
        state.transactionSelection.clear();
        updateTransactionSelectionUi();
    });
    $('#tx-bulk-category').on('change', updateTransactionSelectionUi);
    $('#tx-bulk-apply').on('click', applyBulkCategory);
    $('#tx-body')
        .on('change', '.tx-select', function () {
            toggleTransactionSelection(Number(this.getAttribute('data-id')), this.checked);
        })
        .on('click', '.tx-edit-btn', function () {
            state.editingTransactionId = Number(this.getAttribute('data-id'));
            renderTransactions();
        })
        .on('click', '.tx-reccuring-btn', function () {
            openReccuringFromTransaction(Number(this.getAttribute('data-id')), this);
        })
        .on('click', '.detail-edit-cancel', function () {
            state.editingTransactionId = null;
            renderTransactions();
        })
        .on('submit', '.detail-edit-form', function (event) {
            event.preventDefault();
            saveTransactionEdit(this, afterChange);
        });
}

export { renderTransactions, restoreTransactionFilters };
