/* ==========================================================================
   RaccoonBank - Recurring costs view
   Expected costs for the current month and their matching transactions.
   ========================================================================== */

import { state, CATEGORY_NONE, getCategory, refreshReccuring } from './state.js';
import {
    categoryChip, errorDetail, esc, isReccuringCost, keepSelection, money,
    normalizeReccuringTitle, reccuringSpent, toNumber, toast
} from './utils.js';

function findReccuring(title) {
    const key = normalizeReccuringTitle(title).toLowerCase();
    return state.reccuringCosts.find(cost =>
        normalizeReccuringTitle(cost.title).toLowerCase() === key);
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */

function renderReccuring() {
    renderReccuringCategoryOptions();
    const costs = state.reccuringCosts.slice().sort((a, b) =>
        (Number(a.day) - Number(b.day))
        || String(a.title).localeCompare(String(b.title), 'en', { sensitivity: 'base' }));

    $('#reccuring-body').html(costs.map(renderReccuringRow).join(''));
    $('#reccuring-table-wrap').prop('hidden', costs.length === 0);
    $('#reccuring-empty').prop('hidden', costs.length > 0);
    renderReccuringSummary(costs);
}

function renderReccuringRow(cost) {
    const title = String(cost.title || '');
    const expected = toNumber(cost.amount);
    const spent = reccuringSpent(title);
    return '<tr' + (spent > expected ? ' class="is-spent-below-expected"' : '') + '>'
        + '<td class="date-cell">' + esc(cost.day) + '</td>'
        + '<td><div class="tx-title" title="' + esc(title) + '">' + esc(title) + '</div></td>'
        + '<td>' + categoryChip(getCategory(cost.categoryId)) + '</td>'
        + '<td class="align-right"><span class="amount ' + (expected < 0 ? 'negative' : 'positive') + '">'
            + esc(money.format(expected)) + '</span></td>'
        + '<td class="align-right"><span class="amount ' + (spent < 0 ? 'negative' : 'positive') + '">'
            + esc(money.format(spent)) + '</span></td>'
        + '<td class="col-action"><div class="reccuring-actions">'
            + '<button type="button" class="icon-btn reccuring-edit" data-title="' + esc(title) + '"'
            + ' aria-label="Edit ' + esc(title) + '" title="Edit recurring cost">'
            + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"'
            + ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"'
            + ' stroke-linecap="round"/></svg></button>'
            + '<button type="button" class="icon-btn reccuring-delete" data-title="' + esc(title) + '"'
            + ' aria-label="Delete ' + esc(title) + '" title="Delete recurring cost">'
            + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5h6v2m-8 0 1 13h8l1-13"'
            + ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"'
            + ' stroke-linejoin="round"/></svg></button>'
        + '</div></td>'
        + '</tr>';
}

function renderReccuringSummary(costs) {
    const costEntries = costs.filter(isReccuringCost);
    const expected = d3.sum(costEntries, cost => toNumber(cost.amount));
    const spent = d3.sum(costEntries, cost => reccuringSpent(cost.title));
    const remaining = expected - spent;
    const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    $('#reccuring-total-expected')
        .text(money.format(expected))
        .toggleClass('negative', expected < 0);
    $('#reccuring-total-spent')
        .text(money.format(spent))
        .toggleClass('negative', spent < 0);
    $('#reccuring-total-remaining')
        .text(money.format(remaining))
        .toggleClass('negative', remaining < 0);
    $('#reccuring-expected-sub').text(costEntries.length
        ? costEntries.length + (costEntries.length === 1 ? ' recurring cost' : ' recurring costs')
            + ' · ' + monthLabel
        : 'No recurring costs yet');
    $('#reccuring-spent-sub').text('Matching transactions · ' + monthLabel);
    $('#reccuring-remaining-sub').text('Expected minus spent · ' + monthLabel);
}

function renderReccuringCategoryOptions() {
    const $select = $('#reccuring-category');
    const selected = $select.val();
    $select.empty();
    const categories = state.categories
        .filter(category => Number(category.id) !== CATEGORY_NONE.id)
        .slice()
        .sort((a, b) => Number(a.id) - Number(b.id));
    if (!categories.length) {
        $('<option>', { value: '', text: 'No categories available' }).appendTo($select);
        return;
    }
    categories.forEach(category => {
        $('<option>', { value: category.id, text: category.name }).appendTo($select);
    });
    keepSelection($select, selected);
}

/* --------------------------------------------------------------------------
   Form actions
   -------------------------------------------------------------------------- */

function startReccuringEdit(title) {
    const cost = findReccuring(title);
    if (!cost) {
        return;
    }
    state.editingReccuring = cost.title;
    $('#reccuring-day').val(cost.day).removeClass('is-invalid');
    $('#reccuring-title').val(cost.title).removeClass('is-invalid');
    $('#reccuring-amount').val(toNumber(cost.amount)).removeClass('is-invalid');
    renderReccuringCategoryOptions();
    $('#reccuring-category').val(String(cost.categoryId));
    $('#reccuring-form-title').text('Edit “' + cost.title + '”');
    $('#reccuring-form-sub').text('Change the expected day, title, amount or category.');
    $('#reccuring-submit').text('Save changes');
    $('#reccuring-cancel').prop('hidden', false);
    const form = $('#reccuring-form')[0];
    if (form && form.scrollIntoView) {
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    $('#reccuring-title').trigger('focus');
}

function cancelReccuringEdit() {
    resetReccuringForm();
    renderReccuring();
}

function resetReccuringForm() {
    state.editingReccuring = null;
    const form = $('#reccuring-form')[0];
    if (form) {
        form.reset();
    }
    $('#reccuring-day, #reccuring-title, #reccuring-amount').val('');
    $('#reccuring-form .text-input').removeClass('is-invalid');
    $('#reccuring-form-title').text('Add a recurring cost');
    $('#reccuring-form-sub').text(
        'The title is matched against the transaction titles of the current month.');
    $('#reccuring-submit').text('Add recurring cost');
    $('#reccuring-cancel').prop('hidden', true);
}

async function submitReccuring(event) {
    event.preventDefault();
    const $submit = $('#reccuring-submit');
    const dayText = String($('#reccuring-day').val() || '').trim();
    const day = Number(dayText);
    const title = normalizeReccuringTitle($('#reccuring-title').val());
    const amountText = String($('#reccuring-amount').val() || '').trim();
    const amount = Number(amountText);
    const categoryId = Number($('#reccuring-category').val()) || 0;

    if (!Number.isInteger(day) || day < 1 || day > 31) {
        $('#reccuring-day').addClass('is-invalid').trigger('focus');
        toast('Enter a day between 1 and 31.', 'error');
        return;
    }
    if (!title) {
        $('#reccuring-title').addClass('is-invalid').trigger('focus');
        toast('Give the recurring cost a title.', 'error');
        return;
    }
    if (amountText === '' || !Number.isFinite(amount)) {
        $('#reccuring-amount').addClass('is-invalid').trigger('focus');
        toast('Enter an expected amount.', 'error');
        return;
    }
    if (!categoryId) {
        toast('Choose a category for the recurring cost.', 'error');
        $('#reccuring-category').trigger('focus');
        return;
    }

    const originalTitle = state.editingReccuring;
    const editing = originalTitle !== null && originalTitle !== undefined;
    const payload = {
        day: day,
        title: title,
        amount: amount,
        categoryId: categoryId
    };
    $submit.prop('disabled', true).attr('aria-busy', 'true');
    try {
        await $.ajax({
            url: editing
                ? '/api/reccuring-costs?title=' + encodeURIComponent(originalTitle)
                : '/api/reccuring-costs',
            method: editing ? 'PUT' : 'POST',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify(payload)
        });
        toast(editing
            ? 'Recurring cost “' + title + '” updated.'
            : 'Recurring cost “' + title + '” added.', 'success');
        resetReccuringForm();
        await refreshReccuring();
        renderReccuring();
    } catch (xhr) {
        toast(errorDetail(xhr), 'error');
    } finally {
        $submit.prop('disabled', false).removeAttr('aria-busy');
    }
}

async function deleteReccuring(title) {
    const cost = findReccuring(title);
    if (!cost) {
        return;
    }
    if (!window.confirm('Delete the recurring cost “' + cost.title + '”?\n\n'
        + 'Saved transactions are not changed.')) {
        return;
    }
    try {
        await $.ajax({
            url: '/api/reccuring-costs?title=' + encodeURIComponent(cost.title),
            method: 'DELETE'
        });
        toast('Recurring cost “' + cost.title + '” deleted.', 'success');
        if (normalizeReccuringTitle(state.editingReccuring).toLowerCase()
            === normalizeReccuringTitle(cost.title).toLowerCase()) {
            resetReccuringForm();
        }
        await refreshReccuring();
        renderReccuring();
    } catch (xhr) {
        toast(errorDetail(xhr), 'error');
    }
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

export function initReccuringView() {
    $('#reccuring-form').on('submit', submitReccuring);
    $('#reccuring-cancel').on('click', cancelReccuringEdit);
    $('#reccuring-form .text-input').on('input change', function () {
        this.classList.remove('is-invalid');
    });
    $('#reccuring-body')
        .on('click', '.reccuring-edit', function () {
            startReccuringEdit(this.getAttribute('data-title'));
        })
        .on('click', '.reccuring-delete', function () {
            deleteReccuring(this.getAttribute('data-title'));
        });
}

export { renderReccuring };
