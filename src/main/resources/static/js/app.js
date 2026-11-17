/* ==========================================================================
   RaccoonBank - application core
   Bootstraps the views, owns navigation and orchestrates data loading.
   ========================================================================== */

import { state, loadLedger, refreshTransactions } from './state.js';
import { errorDetail, esc } from './utils.js';
import { initHomeView, renderHome, renderCashflow } from './view-home.js';
import {
    initSpendingView, renderSpending, ensureSpendingAnchors, restoreSpendingFilters,
    resetSpendingState
} from './view-spending.js';
import { initTransactionsView, renderTransactions, restoreTransactionFilters } from './view-transactions.js';
import { initReccuringView, renderReccuring } from './view-reccuring.js';
import { initAdminView, renderAdmin } from './view-admin.js';
import { initImportView, resetImportState } from './view-import.js';

function setTodayLabel() {
    const now = new Date();
    $('#today-label').text(now.toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    }));
}

function triggerFilePicker() {
    if (hasPendingImport()
        && !window.confirm('Discard the current import and choose another file? Nothing has been saved yet.')) {
        return;
    }
    $('#ofx-file').val('').trigger('click');
}

function hasPendingImport() {
    return !$('#import-view').prop('hidden') && $('#import-tbody tr').length > 0;
}

function leaveImport(force) {
    if (!force && hasPendingImport()
        && !window.confirm('Discard this import? Nothing has been saved yet.')) {
        return;
    }
    resetImportState();
    showView('home');
}

function navigateHome() {
    if (!$('#import-view').prop('hidden')) {
        leaveImport(false);
        return;
    }
    showView('home');
}

function openSpending() {
    if (hasPendingImport()
        && !window.confirm('Discard the current import and open spending? Nothing has been saved yet.')) {
        return;
    }
    resetImportState();
    restoreSpendingFilters();
    ensureSpendingAnchors();
    showView('spending');
    renderSpending();
}

function openReccuring() {
    if (hasPendingImport()
        && !window.confirm('Discard the current import and open recurring costs? Nothing has been saved yet.')) {
        return;
    }
    resetImportState();
    showView('reccuring');
    renderReccuring();
}

function openAdmin() {
    if (hasPendingImport()
        && !window.confirm('Discard the current import and open administration? Nothing has been saved yet.')) {
        return;
    }
    resetImportState();
    showView('admin');
    renderAdmin();
}

function openTransactions() {
    if (hasPendingImport()
        && !window.confirm('Discard the current import and open transactions? Nothing has been saved yet.')) {
        return;
    }
    resetImportState();
    showView('transactions');
    renderTransactions();
}

function showHomeError(message) {
    $('#home-error')
        .html('<div><strong>Could not load your ledger.</strong><p>' + esc(message) + '</p></div>')
        .prop('hidden', false);
}

function showView(name) {
    const navView = name === 'import' ? 'home' : name;
    const navButtons = {
        home: '#nav-home',
        spending: '#nav-spending',
        transactions: '#nav-transactions',
        reccuring: '#nav-reccuring',
        admin: '#nav-admin'
    };
    state.editingTransactionId = null;
    $('#home-view').prop('hidden', name !== 'home');
    $('#spending-view').prop('hidden', name !== 'spending');
    $('#transactions-view').prop('hidden', name !== 'transactions');
    $('#reccuring-view').prop('hidden', name !== 'reccuring');
    $('#admin-view').prop('hidden', name !== 'admin');
    $('#import-view').prop('hidden', name !== 'import');
    Object.keys(navButtons).forEach(view => {
        const $nav = $(navButtons[view]);
        const active = view === navView;
        $nav.toggleClass('is-active', active);
        if (active) {
            $nav.attr('aria-current', 'page');
        } else {
            $nav.removeAttr('aria-current');
        }
    });
    if (name === 'home') {
        renderCashflow();
    }
    window.scrollTo(0, 0);
}

async function afterTransactionChange() {
    await refreshTransactions();
    renderHome();
    renderSpending();
    renderTransactions();
}

function bindCoreEvents() {
    $('#brand-home, #nav-home').on('click', function (event) {
        event.preventDefault();
        navigateHome();
    });

    $('#nav-spending, #chart-view-all').on('click', openSpending);
    $('#spending-back-home').on('click', navigateHome);

    $('#nav-transactions').on('click', openTransactions);
    $('#transactions-back-home').on('click', navigateHome);

    $('#nav-reccuring').on('click', openReccuring);
    $('#reccuring-back-home').on('click', navigateHome);

    $('#nav-admin').on('click', openAdmin);
    $('#admin-back-home').on('click', navigateHome);

    $('#import-btn, #import-btn-header, #empty-import-btn, #retry-import, #empty-retry-import, '
        + '#spending-import-btn, #histogram-import-btn').on('click', triggerFilePicker);

    $('#back-home, #discard-import').on('click', function () {
        leaveImport(false);
    });

    $(window).on('beforeunload', function () {
        if (!state.saving && hasPendingImport()) {
            return 'Your imported transactions have not been saved yet.';
        }
        return undefined;
    });
}

async function afterImportSaved() {
    resetSpendingState();
    showView('home');
    try {
        await refreshTransactions();
        $('#home-error').prop('hidden', true);
        renderHome();
    } catch (xhr) {
        showHomeError(errorDetail(xhr));
    }
}

async function afterLedgerChange() {
    await loadLedger();
    resetSpendingState();
    renderHome();
    renderAdmin();
}

async function loadInitialData() {
    try {
        await loadLedger();
        restoreSpendingFilters();
        restoreTransactionFilters();
        $('#home-error').prop('hidden', true);
    } catch (xhr) {
        showHomeError(errorDetail(xhr));
    }
    renderHome();
    if (!$('#spending-view').prop('hidden')) {
        resetSpendingState();
        restoreSpendingFilters();
        renderSpending();
    }
    if (!$('#transactions-view').prop('hidden')) {
        renderTransactions();
    }
    if (!$('#reccuring-view').prop('hidden')) {
        renderReccuring();
    }
}

$(function () {
    setTodayLabel();
    initHomeView();
    initSpendingView({ afterChange: afterTransactionChange });
    initTransactionsView({ afterChange: afterTransactionChange });
    initReccuringView();
    initAdminView({ onLedgerChanged: afterLedgerChange });
    initImportView({ onSaved: afterImportSaved, onShow: showView });
    bindCoreEvents();
    loadInitialData();
});

