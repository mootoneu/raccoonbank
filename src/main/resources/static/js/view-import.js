/* ==========================================================================
   CochonBank2 - OFX import view
   Upload, review, edit and save an imported statement.
   ========================================================================== */

import { state, CATEGORY_NONE, getCategory } from './state.js';
import {
    MAX_FILE_SIZE, categoryOptions, categoryPalette, errorDetail, esc, importRowKey,
    money, normalizeRuleText, toast
} from './utils.js';

function resetImportState() {
    state.importFileName = '';
    state.importOriginalCount = 0;
    state.importWarnings = [];
    $('#import-tbody').empty();
    $('#import-editor').prop('hidden', true);
    $('#import-loading').prop('hidden', true);
    $('#import-error').prop('hidden', true);
    $('#import-empty').prop('hidden', true);
    $('#import-warnings').prop('hidden', true).empty();
    $('#import-subtitle').text('Choose an OFX file to begin.');
    $('#save-all-top').prop('disabled', true);
    $('#save-all').prop('disabled', true);
    $('#discard-saved-import').prop('hidden', true).prop('disabled', true);
    $('#import-filename').text('—');
}

/* --------------------------------------------------------------------------
   File loading
   -------------------------------------------------------------------------- */

async function startImport(file) {
    if (!/\.ofx$/i.test(file.name)) {
        toast('Please choose an OFX file (.ofx).', 'error');
        return;
    }
    if (file.size > MAX_FILE_SIZE) {
        toast('This file is larger than the 10 MB limit.', 'error');
        return;
    }

    state.importFileName = file.name;
    state.importWarnings = [];
    state.saving = false;

    onShow('import');
    $('#import-subtitle').text('Reading ' + file.name + '…');
    $('#save-all-top').prop('disabled', true);
    $('#import-editor').prop('hidden', true);
    $('#import-empty').prop('hidden', true);
    $('#import-error').prop('hidden', true);
    $('#import-warnings').prop('hidden', true).empty();
    $('#import-loading-file').text('Reading ' + file.name + '…');
    $('#import-loading').prop('hidden', false);

    const formData = new FormData();
    formData.append('file', file);

    try {
        const result = await $.ajax({
            url: '/api/transactions/import',
            method: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            dataType: 'json'
        });
        state.importFileName = result.fileName || file.name;
        state.importWarnings = Array.isArray(result.warnings) ? result.warnings : [];
        showImportResult(Array.isArray(result.transactions) ? result.transactions : []);
    } catch (error) {
        console.error('OFX import failed', error);
        showImportError(errorDetail(error));
    }
}

function showImportResult(transactions) {
    $('#import-loading').prop('hidden', true);
    $('#import-error').prop('hidden', true);
    renderWarnings(state.importWarnings);

    if (!transactions.length) {
        state.importOriginalCount = 0;
        $('#import-editor').prop('hidden', true);
        $('#import-subtitle').text('No transactions found in ' + state.importFileName + '.');
        $('#save-all-top').prop('disabled', true);
        showEditorEmptyState(
            'No transactions found',
            'This OFX file contained no usable bank statements. Try another file.');
        return;
    }

    state.importOriginalCount = transactions.length;
    updateImportSubtitle(transactions.length);
    $('#import-filename').text(state.importFileName);
    $('#import-empty').prop('hidden', true);
    $('#import-editor').prop('hidden', false);
    $('#import-error').prop('hidden', true);

    renderImportRows(transactions);
    updateImportSummary();
    $('#save-all-top').prop('disabled', false);
}

function updateImportSubtitle(remaining) {
    const total = state.importOriginalCount || remaining;
    const countText = remaining === total
        ? remaining + (remaining === 1 ? ' transaction' : ' transactions')
        : remaining + ' of ' + total + ' transactions';
    $('#import-subtitle').text(
        countText + ' from ' + state.importFileName
        + '. Review the details and edit anything that needs fixing.');
}

function showEditorEmptyState(title, text) {
    $('#import-empty-title').text(title);
    $('#import-empty-text').text(text);
    $('#import-empty').prop('hidden', false);
    $('#import-editor').prop('hidden', true);
    $('#save-all-top').prop('disabled', true);
    $('#discard-saved-import').prop('hidden', true).prop('disabled', true);
}

function showImportError(message) {
    $('#import-loading').prop('hidden', true);
    $('#import-empty').prop('hidden', true);
    $('#import-editor').prop('hidden', true);
    $('#import-warnings').prop('hidden', true).empty();
    $('#import-error-detail').text(message || 'The OFX file could not be imported.');
    $('#import-error').prop('hidden', false);
    $('#import-subtitle').text('Nothing was saved. Fix the file and try again.');
    $('#save-all-top').prop('disabled', true);
    toast(message || 'The OFX file could not be imported.', 'error');
}

function renderWarnings(warnings) {
    const $warnings = $('#import-warnings').empty();
    if (!warnings || !warnings.length) {
        $warnings.prop('hidden', true);
        return;
    }
    const items = warnings.map(warning => '<li>' + esc(warning) + '</li>').join('');
    $warnings.html(
        '<div><strong>' + warnings.length
        + (warnings.length === 1 ? ' line could not be imported.' : ' lines could not be imported.')
        + '</strong><ul>' + items + '</ul></div>'
    ).prop('hidden', false);
}

/* --------------------------------------------------------------------------
   Review table
   -------------------------------------------------------------------------- */

function renderImportRows(transactions) {
    const html = transactions.map((transaction, index) => {
        const amount = transaction.amount === null || transaction.amount === undefined
            ? ''
            : Number(transaction.amount).toFixed(2);
        const billId = transaction.billId === null || transaction.billId === undefined
            ? ''
            : String(transaction.billId).trim();

        return '<tr>'
            + '<td><div class="category-cell">'
                + '<select class="category-select" aria-label="Category, row ' + (index + 1) + '">'
                + categoryOptions(transaction.categoryId) + '</select>'
                + '<button type="button" class="row-default"'
                + ' title="Create a default category from this line"'
                + ' aria-label="Create default category, row ' + (index + 1) + '">'
                + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"'
                + ' fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
                + '</button>'
                + '</div></td>'
            + '<td><input class="cell-input type-input" type="text" list="payment-types"'
                + ' aria-label="Payment type, row ' + (index + 1) + '"'
                + ' value="' + esc(transaction.paymentType || '') + '" placeholder="DEBIT"></td>'
            + '<td><input class="cell-input amount-input" type="number" step="0.01"'
                + ' aria-label="Amount, row ' + (index + 1) + '"'
                + ' value="' + esc(amount) + '" placeholder="0.00"></td>'
            + '<td><input class="cell-input bank-date-input" type="date"'
                + ' aria-label="Bank date, row ' + (index + 1) + '"'
                + ' value="' + esc(transaction.bankDate || '') + '"></td>'
            + '<td><input class="cell-input real-date-input" type="date"'
                + ' aria-label="Real date, row ' + (index + 1) + '"'
                + ' value="' + esc(transaction.realDate || '') + '"></td>'
            + '<td><input class="cell-input title-input" type="text"'
                + ' aria-label="Title, row ' + (index + 1) + '"'
                + ' value="' + esc(transaction.title || '') + '" placeholder="Transaction title"></td>'
            + '<td><input class="cell-input description-input" type="text"'
                + ' aria-label="Description, row ' + (index + 1) + '"'
                + ' value="' + esc(transaction.description || '') + '" placeholder="Optional note"></td>'
            + '<td><input class="cell-input bill-input" type="text"'
                + ' aria-label="Bill identifier, row ' + (index + 1) + '"'
                + ' value="' + esc(billId) + '" placeholder="Ref."></td>'
            + '<td class="status-cell" aria-live="polite"></td>'
            + '<td><button type="button" class="row-remove" title="Remove this row"'
                + ' aria-label="Remove row ' + (index + 1) + '">'
                + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"'
                + ' fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
                + '</button></td>'
            + '</tr>';
    }).join('');

    $('#import-tbody').html(html);
    $('#import-tbody .category-select').each(function () {
        paintCategorySelect(this);
    });
}

function paintCategorySelect(select) {
    const category = getCategory(select.value);
    const palette = categoryPalette(category.color);
    select.style.backgroundColor = palette.background;
    select.style.color = palette.foreground;
    const row = select.closest ? select.closest('tr') : null;
    if (row) {
        row.classList.toggle('is-uncategorized',
            Number(select.value) === Number(CATEGORY_NONE.id));
    }
}

/**
 * Saves the current line as a default category rule: future imports whose
 * title starts with this line's title get the selected category.
 */
async function rememberDefaultCategory(button) {
    const $button = $(button);
    const $row = $button.closest('tr');
    const $category = $row.find('.category-select');
    const $title = $row.find('.title-input');
    const $description = $row.find('.description-input');
    const categoryId = Number($category.val()) || 0;
    const title = String($title.val() || '').trim();
    const description = String($description.val() || '').trim();

    if (categoryId === 0) {
        toast('Choose a category on this line before creating a default category.', 'error');
        $category.trigger('focus');
        return;
    }
    if (!title) {
        toast('This line needs a title before you can create a default category.', 'error');
        $title.trigger('focus');
        return;
    }

    $button.prop('disabled', true).attr('aria-busy', 'true');
    try {
        const created = await $.ajax({
            url: '/api/default-categories',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                categoryId: categoryId,
                pattern: title,
                description: description
            })
        });
        const applied = applyDefaultCategoryToDrafts(created);
        const suffix = applied === 0
            ? ''
            : applied === 1
                ? ' and applied to 1 line.'
                : ' and applied to ' + applied + ' lines.';
        toast('Default category created for “' + created.pattern + '”' + suffix, 'success');
    } catch (xhr) {
        toast(errorDetail(xhr), 'error');
    } finally {
        $button.prop('disabled', false).removeAttr('aria-busy');
    }
}

/**
 * Re-applies a freshly created rule to every draft whose title starts with
 * the rule pattern, ignoring case and repeated whitespace. The line that
 * created the rule is included. Non-empty descriptions are kept.
 */
function applyDefaultCategoryToDrafts(rule) {
    const pattern = normalizeRuleText(rule.pattern);
    if (!pattern) {
        return 0;
    }
    const categoryId = Number(rule.categoryId) || 0;
    const description = normalizeRuleText(rule.description);
    const lowerPattern = pattern.toLowerCase();
    let applied = 0;

    $('#import-tbody tr').each(function () {
        const $row = $(this);
        const title = normalizeRuleText($row.find('.title-input').val());
        if (!title || !title.toLowerCase().startsWith(lowerPattern)) {
            return;
        }

        const select = $row.find('.category-select')[0];
        if (select) {
            select.value = String(categoryId);
            select.classList.remove('is-invalid');
            paintCategorySelect(select);
        }
        if (description) {
            const $lineDescription = $row.find('.description-input');
            if (!$lineDescription.val() || !String($lineDescription.val()).trim()) {
                $lineDescription.val(description);
            }
        }
        applied += 1;
    });

    if (applied) {
        updateImportSummary();
    }
    return applied;
}

function renumberRows() {
    $('#import-tbody tr').each(function (index) {
        $(this).find('[aria-label]').each(function () {
            const label = this.getAttribute('aria-label');
            const column = label.split(',')[0];
            this.setAttribute('aria-label', column + ', row ' + (index + 1));
        });
        const removeButton = this.querySelector('.row-remove');
        if (removeButton) {
            removeButton.setAttribute('aria-label', 'Remove row ' + (index + 1));
        }
    });
}

function savedImportKeys() {
    const keys = new Set();
    state.transactions.forEach(transaction => {
        const key = importRowKey(transaction.amount, transaction.bankDate, transaction.title);
        if (key !== null) {
            keys.add(key);
        }
    });
    return keys;
}

function updateImportSummary() {
    const $rows = $('#import-tbody tr');
    const savedKeys = savedImportKeys();
    let duplicates = 0;
    let net = 0;
    $rows.each(function () {
        const $row = $(this);
        const raw = $row.find('.amount-input').val();
        const amount = Number(raw);
        if (raw !== '' && Number.isFinite(amount)) {
            net += amount;
        }

        const key = importRowKey(
            raw,
            $row.find('.bank-date-input').val(),
            $row.find('.title-input').val());
        const duplicate = key !== null && savedKeys.has(key);
        if (duplicate) {
            duplicates += 1;
        }
        $row.toggleClass('is-duplicate', duplicate);

        const $status = $row.find('.status-cell');
        if (duplicate && !$status.hasClass('is-marked')) {
            $status.addClass('is-marked').html(
                '<span class="duplicate-badge" title="This amount, bank date and title'
                + ' already exist in transactions.csv">Saved</span>');
        } else if (!duplicate && $status.hasClass('is-marked')) {
            $status.removeClass('is-marked').empty();
        }
    });

    const $note = $('#import-duplicate-note');
    if (duplicates > 0) {
        $note.text(duplicates === 1
            ? '1 row is already saved'
            : duplicates + ' rows are already saved').prop('hidden', false);
    } else {
        $note.prop('hidden', true).text('');
    }

    $('#discard-saved-import')
        .prop('hidden', duplicates === 0)
        .prop('disabled', state.saving || duplicates === 0);

    $('#import-count').text($rows.length);
    $('#import-count-label').text($rows.length === 1 ? 'transaction' : 'transactions');
    $('#import-total').text($rows.length ? 'Net ' + money.format(net) : '');
    $('#save-all').prop('disabled', state.saving || $rows.length === 0);
    $('#save-all-top').prop('disabled', state.saving || $rows.length === 0);
}

/** Refresh the review table after one or more rows were removed. */
function afterRowsRemoved() {
    const remaining = $('#import-tbody tr').length;
    if (remaining === 0) {
        $('#import-subtitle').text('All imported rows were removed. Nothing will be saved.');
        showEditorEmptyState(
            'All rows removed',
            'Nothing will be written to transactions.csv. Choose another file or go back home.'
        );
        updateImportSummary();
        return;
    }
    updateImportSubtitle(remaining);
    renumberRows();
    updateImportSummary();
}

/** Remove every review row whose status is "Saved" (already in transactions.csv). */
function discardSavedRows() {
    const $savedRows = $('#import-tbody tr.is-duplicate');
    if (!$savedRows.length) {
        return;
    }
    const removed = $savedRows.length;
    $savedRows.remove();
    afterRowsRemoved();
    toast(removed === 1 ? '1 saved row discarded.' : removed + ' saved rows discarded.', 'success');
}

/* --------------------------------------------------------------------------
   Saving
   -------------------------------------------------------------------------- */

async function saveAll() {
    if (state.saving) {
        return;
    }

    const result = readDraftsFromTable();
    if (result.firstInvalid) {
        result.firstInvalid.focus();
        toast('Please fix the highlighted fields before saving.', 'error');
        return;
    }
    if (!result.drafts.length) {
        toast('There are no transactions to save.', 'error');
        return;
    }

    setSaving(true);
    let response;
    try {
        response = await $.ajax({
            url: '/api/transactions',
            method: 'POST',
            contentType: 'application/json; charset=UTF-8',
            dataType: 'json',
            data: JSON.stringify(result.drafts)
        });
    } catch (xhr) {
        toast(errorDetail(xhr), 'error');
        setSaving(false);
        return;
    }

    const saved = Number(response.saved) || result.drafts.length;
    toast(saved + (saved === 1 ? ' transaction added' : ' transactions added')
        + ' to transactions.csv.', 'success');
    resetImportState();
    setSaving(false);
    await onSaved(saved);
}

function readDraftsFromTable() {
    const drafts = [];
    let firstInvalid = null;

    $('#import-tbody tr').each(function () {
        const $row = $(this);
        const $amount = $row.find('.amount-input');
        const $bankDate = $row.find('.bank-date-input');
        const $title = $row.find('.title-input');
        const $bill = $row.find('.bill-input');
        const $realDate = $row.find('.real-date-input');
        const $paymentType = $row.find('.type-input');
        const $description = $row.find('.description-input');

        $row.find('.is-invalid').removeClass('is-invalid');
        let invalid = false;

        const mark = $input => {
            $input.addClass('is-invalid');
            if (!firstInvalid) {
                firstInvalid = $input[0];
            }
            invalid = true;
        };

        const amountRaw = String($amount.val() || '').trim();
        const amount = amountRaw === '' ? NaN : Number(amountRaw);
        if (!Number.isFinite(amount)) {
            mark($amount);
        }
        if (!$bankDate.val()) {
            mark($bankDate);
        }
        if (!String($title.val() || '').trim()) {
            mark($title);
        }

        const billRaw = String($bill.val() || '').trim();

        if (invalid) {
            return;
        }

        drafts.push({
            categoryId: Number($row.find('.category-select').val()) || 0,
            paymentType: String($paymentType.val() || '').trim(),
            amount: amount,
            bankDate: $bankDate.val() || null,
            realDate: $realDate.val() || null,
            title: String($title.val() || '').trim(),
            description: String($description.val() || '').trim(),
            billId: billRaw
        });
    });

    return { drafts: drafts, firstInvalid: firstInvalid };
}

function setSaving(saving) {
    state.saving = saving;
    $('#save-all, #save-all-top')
        .toggleClass('is-saving', saving)
        .find('.btn-label')
        .text(saving ? 'Saving…' : 'Save all transactions');
    $('#save-all, #save-all-top').prop('disabled', saving || $('#import-tbody tr').length === 0);
    $('#discard-import, #back-home').prop('disabled', saving);
    $('#discard-saved-import').prop('disabled',
        saving || $('#import-tbody tr.is-duplicate').length === 0);
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

let onSaved = async () => {};
let onShow = () => {};

export function initImportView(options) {
    onSaved = (options && options.onSaved) || onSaved;
    onShow = (options && options.onShow) || onShow;

    $('#ofx-file').on('change', function () {
        const file = this.files && this.files[0];
        this.value = '';
        if (file) {
            startImport(file);
        }
    });

    $('#save-all, #save-all-top').on('click', saveAll);
    $('#discard-saved-import').on('click', discardSavedRows);

    $('#import-tbody')
        .on('change', '.category-select', function () {
            paintCategorySelect(this);
            this.classList.remove('is-invalid');
            updateImportSummary();
        })
        .on('input', '.cell-input', function () {
            this.classList.remove('is-invalid');
            updateImportSummary();
        })
        .on('click', '.row-default', function () {
            rememberDefaultCategory(this);
        })
        .on('click', '.row-remove', function () {
            $(this).closest('tr').remove();
            afterRowsRemoved();
        });
}

export { resetImportState };
