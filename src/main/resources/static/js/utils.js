/* ==========================================================================
   CochonBank2 - shared utilities
   Formatting, colors, escaping, storage, categories and small DOM helpers used
   by the core and by every view module.
   ========================================================================== */

import { state, CATEGORY_NONE, FALLBACK_COLOR, getCategory } from './state.js';

export const EARNED_COLOR = '#1F6B45';
export const OVERSPEND_COLOR = '#E4664F';
const INK = '#152621';
const WHITE_RGB = Object.freeze({ r: 255, g: 255, b: 255 });
const INK_RGB = Object.freeze({ r: 21, g: 38, b: 33 });
const MIN_CONTRAST = 4.5;
const categoryPaletteCache = new Map();
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const STORAGE_KEYS = Object.freeze({
    spendingFilters: 'cochonbank2.spending.filters',
    transactionFilters: 'cochonbank2.transactions.filters'
});

export const money = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const longDate = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
});

/* --------------------------------------------------------------------------
   Formatting and dates
   -------------------------------------------------------------------------- */

export function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

export function monthKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

export function parseIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) {
        return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
        return null;
    }
    return date;
}

export function isoDay(date) {
    return date.getFullYear() + '-'
        + String(date.getMonth() + 1).padStart(2, '0') + '-'
        + String(date.getDate()).padStart(2, '0');
}

export function formatLongDate(date) {
    return longDate.format(date);
}

export function compactMoney(value) {
    if (!Number.isFinite(value) || value === 0) {
        return '€0';
    }
    return '€' + d3.format('.2~s')(value);
}

export function signedMoney(value) {
    return (value > 0 ? '+' : '') + money.format(value);
}

export function formatDate(isoDate) {
    if (!isoDate) {
        return '—';
    }
    const parts = String(isoDate).split('-');
    if (parts.length !== 3) {
        return String(isoDate);
    }
    return parts[2] + '/' + parts[1] + '/' + parts[0];
}

/* --------------------------------------------------------------------------
   Colors
   -------------------------------------------------------------------------- */

export function safeColor(color) {
    const value = String(color || '').trim();
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : FALLBACK_COLOR;
}

/**
 * Category chips and dropdown lines use the category colour as their
 * background. The colour is used exactly when white or the app ink is
 * readable on it. For the few mid-tone colours where neither reaches
 * 4.5:1, the background is nudged towards black or white until the text
 * passes, keeping the hue recognisable.
 */
export function categoryPalette(color) {
    const base = hexToRgb(safeColor(color));
    if (!base) {
        return { background: FALLBACK_COLOR, foreground: INK };
    }
    const key = toHex(base);
    const cached = categoryPaletteCache.get(key);
    if (cached) {
        return cached;
    }

    const whiteRatio = contrastRatio(base, WHITE_RGB);
    const inkRatio = contrastRatio(base, INK_RGB);
    let palette;
    if (whiteRatio >= MIN_CONTRAST || inkRatio >= MIN_CONTRAST) {
        palette = {
            background: key,
            foreground: whiteRatio >= inkRatio ? '#FFFFFF' : INK
        };
    } else {
        const darker = nudgeToward(base, { r: 0, g: 0, b: 0 }, WHITE_RGB);
        const lighter = nudgeToward(base, WHITE_RGB, INK_RGB);
        if (darker && (!lighter || darker.steps <= lighter.steps)) {
            palette = { background: toHex(darker.color), foreground: '#FFFFFF' };
        } else if (lighter) {
            palette = { background: toHex(lighter.color), foreground: INK };
        } else {
            palette = {
                background: key,
                foreground: whiteRatio >= inkRatio ? '#FFFFFF' : INK
            };
        }
    }
    categoryPaletteCache.set(key, palette);
    return palette;
}

function nudgeToward(base, target, text) {
    for (let step = 1; step <= 50; step++) {
        const amount = step / 50;
        const color = {
            r: Math.round(base.r + (target.r - base.r) * amount),
            g: Math.round(base.g + (target.g - base.g) * amount),
            b: Math.round(base.b + (target.b - base.b) * amount)
        };
        if (contrastRatio(color, text) >= MIN_CONTRAST) {
            return { color: color, steps: step };
        }
    }
    return null;
}

function contrastRatio(first, second) {
    const a = relativeLuminance(first);
    const b = relativeLuminance(second);
    const lighter = Math.max(a, b);
    const darker = Math.min(a, b);
    return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(rgb) {
    return 0.2126 * linearChannel(rgb.r)
        + 0.7152 * linearChannel(rgb.g)
        + 0.0722 * linearChannel(rgb.b);
}

function toHex(rgb) {
    const part = value => Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, '0');
    return '#' + part(rgb.r) + part(rgb.g) + part(rgb.b);
}

function hexToRgb(color) {
    const value = String(color || '').trim();
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (!match) {
        return null;
    }
    let hex = match[1];
    if (hex.length === 3) {
        hex = hex.split('').map(character => character + character).join('');
    }
    return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
    };
}

function linearChannel(channel) {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

export function truncate(value, maxLength) {
    const text = String(value || '');
    return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
}

export function esc(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* --------------------------------------------------------------------------
   Category UI helpers
   -------------------------------------------------------------------------- */

export function categoryChip(category) {
    const palette = categoryPalette(category.color);
    return '<span class="chip" style="background-color:' + palette.background
        + ';color:' + palette.foreground + ';" title="' + esc(category.name) + '">'
        + esc(category.name) + '</span>';
}

export function categoryOptions(selectedId) {
    const selected = Number(selectedId) || 0;
    const categories = [CATEGORY_NONE];
    state.categories.forEach(category => {
        if (!categories.some(known => Number(known.id) === Number(category.id))) {
            categories.push(category);
        }
    });
    if (!categories.some(category => Number(category.id) === selected)) {
        categories.push(getCategory(selected));
    }
    categories.sort((a, b) => Number(a.id) - Number(b.id));
    return categories.map(category => {
        const id = Number(category.id);
        const palette = categoryPalette(category.color);
        return '<option value="' + id + '"' + (id === selected ? ' selected' : '')
            + ' style="background-color:' + palette.background + ';color:' + palette.foreground + ';">'
            + esc(category.name) + '</option>';
    }).join('');
}

export function fillSelect($select, options) {
    const current = $select.val();
    $select.empty();
    options.forEach(option => {
        $('<option>', { value: option.value, text: option.label }).appendTo($select);
    });
    if (current !== null && current !== undefined) {
        keepSelection($select, current);
    }
}

export function keepSelection($select, value) {
    if (value === undefined || value === null) {
        return;
    }
    const found = $select.find('option').filter(function () {
        return this.value === String(value);
    });
    if (found.length) {
        $select.val(String(value));
    }
}

/* --------------------------------------------------------------------------
   Recurring costs
   -------------------------------------------------------------------------- */

export function normalizeReccuringTitle(value) {
    return String(value === null || value === undefined ? '' : value)
        .trim()
        .replace(/\s+/g, ' ');
}

/** A recurring entry is a cost when its expected amount is negative. */
export function isReccuringCost(cost) {
    return toNumber(cost.amount) < 0;
}

/** A recurring entry is a gain when its expected amount is positive. */
export function isReccuringGain(cost) {
    return toNumber(cost.amount) > 0;
}

export function reccuringSpent(title) {
    const currentMonth = monthKey(new Date());
    const key = normalizeReccuringTitle(title).toLowerCase();
    return state.transactions.reduce((total, transaction) => {
        if (!transaction.bankDate || !String(transaction.bankDate).startsWith(currentMonth)) {
            return total;
        }
        if (normalizeReccuringTitle(transaction.title).toLowerCase() !== key) {
            return total;
        }
        return total + toNumber(transaction.amount);
    }, 0);
}

/* --------------------------------------------------------------------------
   Import helpers
   -------------------------------------------------------------------------- */

export function normalizeRuleText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

/**
 * A saved row is a duplicate when the amount (in cents), the bank date and
 * the title all match. Amounts are compared as integers so that floating
 * point noise cannot hide a duplicate. Titles are trimmed and internal
 * whitespace is collapsed because the OFX parser normalizes names that way,
 * while older ledger files may still contain repeated spaces.
 */
export function importRowKey(amount, bankDate, title) {
    if (amount === null || amount === undefined || amount === '') {
        return null;
    }
    const cents = Math.round(Number(amount) * 100);
    const day = String(bankDate || '').trim();
    const label = String(title || '').trim().replace(/\s+/g, ' ');
    if (!Number.isFinite(cents) || !day || !label) {
        return null;
    }
    return cents + '|' + day + '|' + label;
}

/* --------------------------------------------------------------------------
   Storage
   -------------------------------------------------------------------------- */

export function readStoredState(key) {
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
            return null;
        }
        const value = JSON.parse(raw);
        return value && typeof value === 'object' ? value : null;
    } catch (error) {
        return null;
    }
}

export function storeState(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        // Filtering still works when storage is unavailable (private mode, quota).
    }
}

/* --------------------------------------------------------------------------
   Feedback and shared DOM helpers
   -------------------------------------------------------------------------- */

export function toast(message, type) {
    const $toast = $('#toast');
    window.clearTimeout($toast.data('timer'));
    $toast
        .removeClass('success error')
        .addClass(type || '')
        .text(message);
    // Restart the transition when a toast is already visible.
    $toast.removeClass('show');
    window.requestAnimationFrame(() => $toast.addClass('show'));
    const timer = window.setTimeout(() => $toast.removeClass('show'), 4600);
    $toast.data('timer', timer);
}

export function errorDetail(xhr) {
    if (xhr && xhr.responseJSON) {
        const body = xhr.responseJSON;
        return body.detail || body.message || body.title || 'Something went wrong.';
    }
    if (xhr && xhr.status === 0) {
        return 'The server could not be reached. Is CochonBank2 still running?';
    }
    if (typeof xhr === 'string') {
        return xhr;
    }
    return (xhr && xhr.statusText) || 'Something went wrong.';
}

/* --------------------------------------------------------------------------
   Shared transaction editor (transactions view and spending detail)
   -------------------------------------------------------------------------- */

export function renderDetailEditRow(transaction, columns) {
    const id = Number(transaction.id);
    return '<tr class="detail-edit-row"><td colspan="' + (columns || 6) + '">'
        + '<form class="detail-edit-form" data-id="' + id + '">'
        + '<div class="detail-edit-title">' + esc(transaction.title)
            + ' <span class="tx-sub">' + esc(formatDate(transaction.bankDate)) + '</span></div>'
        + '<div class="detail-edit-fields">'
        + '<label class="field"><span class="field-label">Category</span>'
            + '<select name="categoryId" class="text-input">' + categoryOptions(transaction.categoryId)
            + '</select></label>'
        + '<label class="field"><span class="field-label">Description</span>'
            + '<input type="text" name="description" class="text-input" maxlength="200" value="'
            + esc(transaction.description || '') + '"></label>'
        + '<label class="field"><span class="field-label">Ref.</span>'
            + '<input type="text" name="billId" class="text-input" maxlength="60" value="'
            + esc(transaction.billId || '') + '"></label>'
        + '</div>'
        + '<div class="detail-edit-actions">'
            + '<button type="button" class="btn btn-ghost btn-sm detail-edit-cancel">Cancel</button>'
            + '<button type="submit" class="btn btn-primary btn-sm">Save</button>'
        + '</div>'
        + '</form></td></tr>';
}

export async function saveTransactionEdit(form, afterChange) {
    const $form = $(form);
    const id = Number($form.attr('data-id'));
    const categoryId = Number($form.find('select[name="categoryId"]').val()) || 0;
    const description = String($form.find('input[name="description"]').val() || '').trim();
    const billId = String($form.find('input[name="billId"]').val() || '').trim();

    $form.find('button').prop('disabled', true);
    try {
        await $.ajax({
            url: '/api/transactions/' + encodeURIComponent(id),
            method: 'PUT',
            contentType: 'application/json',
            dataType: 'json',
            data: JSON.stringify({ categoryId: categoryId, description: description, billId: billId })
        });
        state.editingTransactionId = null;
        toast('Transaction updated.', 'success');
        if (afterChange) {
            await afterChange();
        }
    } catch (xhr) {
        toast(errorDetail(xhr), 'error');
        $form.find('button').prop('disabled', false);
    }
}

