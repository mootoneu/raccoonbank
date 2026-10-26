/* ==========================================================================
   CochonBank2 — frontend
   jQuery handles the UI, D3 renders the spending chart.
   ========================================================================== */

(function ($, d3) {
    'use strict';

    const CATEGORY_NONE = Object.freeze({
        id: 0,
        name: 'Uncategorized',
        color: '#C7C0B2'
    });
    const FALLBACK_COLOR = '#A8A29E';
    const MAX_FILE_SIZE = 10 * 1024 * 1024;

    const money = new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    const state = {
        categories: [],
        categoryById: new Map(),
        transactions: [],
        importFileName: '',
        importOriginalCount: 0,
        importWarnings: [],
        saving: false
    };

    $(function () {
        setTodayLabel();
        bindEvents();
        loadInitialData();
    });

    /* ----------------------------------------------------------------------
       Events
       ---------------------------------------------------------------------- */

    function bindEvents() {
        $('#brand-home').on('click', function (event) {
            event.preventDefault();
            if (!$('#import-view').prop('hidden')) {
                leaveImport(false);
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        $('#import-btn, #import-btn-header, #empty-import-btn, #retry-import, #empty-retry-import')
            .on('click', triggerFilePicker);

        $('#ofx-file').on('change', function () {
            const file = this.files && this.files[0];
            this.value = '';
            if (file) {
                startImport(file);
            }
        });

        $('#back-home, #discard-import').on('click', function () {
            leaveImport(false);
        });

        $('#save-all, #save-all-top').on('click', saveAll);

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
            .on('click', '.row-remove', function () {
                $(this).closest('tr').remove();
                const remaining = $('#import-tbody tr').length;
                if (remaining === 0) {
                    $('#import-subtitle').text('All imported rows were removed. Nothing will be saved.');
                    showEditorEmptyState(
                        'All rows removed',
                        'Nothing will be written to transactions.csv. Choose another file or go back home.'
                    );
                    updateImportSummary();
                } else {
                    updateImportSubtitle(remaining);
                    renumberRows();
                    updateImportSummary();
                }
            });

        $(window).on('beforeunload', function () {
            if (!state.saving && hasPendingImport()) {
                return 'Your imported transactions have not been saved yet.';
            }
            return undefined;
        });
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

    /* ----------------------------------------------------------------------
       Initial data
       ---------------------------------------------------------------------- */

    async function loadInitialData() {
        try {
            const results = await Promise.all([
                $.getJSON('/api/categories'),
                $.getJSON('/api/transactions')
            ]);
            state.categories = Array.isArray(results[0]) ? results[0] : [];
            state.transactions = Array.isArray(results[1]) ? results[1] : [];
            state.categoryById = new Map(state.categories.map(category => [Number(category.id), category]));
            state.categoryById.set(CATEGORY_NONE.id, CATEGORY_NONE);
            $('#home-error').prop('hidden', true);
        } catch (xhr) {
            showHomeError(errorDetail(xhr));
        }
        renderHome();
    }

    async function refreshTransactions() {
        state.transactions = await $.getJSON('/api/transactions');
    }

    function showHomeError(message) {
        $('#home-error')
            .html('<div><strong>Could not load your ledger.</strong><p>' + esc(message) + '</p></div>')
            .prop('hidden', false);
    }

    /* ----------------------------------------------------------------------
       Home dashboard
       ---------------------------------------------------------------------- */

    function renderHome() {
        renderStats();
        renderChart();
        renderRecentTransactions();
    }

    function renderStats() {
        const transactions = state.transactions;
        const balance = d3.sum(transactions, transaction => toNumber(transaction.amount));

        const now = new Date();
        const currentMonth = monthKey(now);
        const monthTransactions = transactions.filter(transaction =>
            transaction.bankDate && String(transaction.bankDate).startsWith(currentMonth));
        const spent = Math.abs(d3.sum(
            monthTransactions.filter(transaction => toNumber(transaction.amount) < 0),
            transaction => toNumber(transaction.amount)));
        const income = d3.sum(
            monthTransactions.filter(transaction => toNumber(transaction.amount) > 0),
            transaction => toNumber(transaction.amount));

        $('#stat-balance')
            .text(money.format(balance))
            .toggleClass('negative', balance < 0);
        $('#stat-tx-count').text(
            transactions.length + (transactions.length === 1 ? ' transaction saved' : ' transactions saved'));

        $('#stat-spent').text(money.format(spent));
        $('#stat-income').text(money.format(income));
        $('#stat-month-label').text(now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));

        const usedCategories = new Set(
            transactions.map(transaction => Number(transaction.categoryId) || 0));
        $('#stat-category-count').text(
            usedCategories.size + (usedCategories.size === 1 ? ' category in use' : ' categories in use'));
    }
    function renderRecentTransactions() {
        const transactions = state.transactions;
        const $body = $('#recent-body').empty();
        $('#recent-count').text(transactions.length);

        if (!transactions.length) {
            $('#recent-table-wrap').prop('hidden', true);
            $('#recent-empty').prop('hidden', false);
            return;
        }

        $('#recent-empty').prop('hidden', true);
        $('#recent-table-wrap').prop('hidden', false);

        const rows = transactions.map(transaction => {
            const category = getCategory(transaction.categoryId);
            const amount = toNumber(transaction.amount);
            const description = transaction.description
                ? '<div class="tx-sub" title="' + esc(transaction.description) + '">'
                    + esc(transaction.description) + '</div>'
                : (transaction.realDate
                    ? '<div class="tx-sub">Real date · ' + esc(formatDate(transaction.realDate)) + '</div>'
                    : '');
            return '<tr>'
                + '<td class="date-cell">' + esc(formatDate(transaction.bankDate)) + '</td>'
                + '<td><div class="tx-title" title="' + esc(transaction.title) + '">'
                    + esc(transaction.title) + '</div>' + description + '</td>'
                + '<td>' + categoryChip(category) + '</td>'
                + '<td class="col-type"><span class="type-tag">'
                    + esc(transaction.paymentType || '—') + '</span></td>'
                + '<td class="align-right"><span class="amount ' + (amount < 0 ? 'negative' : 'positive') + '">'
                    + esc(money.format(amount)) + '</span></td>'
                + '</tr>';
        }).join('');

        $body.html(rows);
    }

    function categoryChip(category) {
        const background = safeColor(category.color);
        const foreground = readableTextColor(background);
        return '<span class="chip" style="background-color:' + background
            + ';color:' + foreground + ';" title="' + esc(category.name) + '">'
            + esc(category.name) + '</span>';
    }

    /* ----------------------------------------------------------------------
       D3 donut chart
       ---------------------------------------------------------------------- */

    function renderChart() {
        const expenses = state.transactions.filter(transaction => toNumber(transaction.amount) < 0);
        const totals = d3.rollup(
            expenses,
            values => d3.sum(values, transaction => Math.abs(toNumber(transaction.amount))),
            transaction => Number(transaction.categoryId) || 0);

        const data = Array.from(totals, entry => ({
            category: getCategory(entry[0]),
            value: entry[1]
        }))
            .filter(entry => entry.value > 0)
            .sort((a, b) => b.value - a.value);

        const svg = d3.select('#spending-chart');
        svg.selectAll('*').remove();
        d3.select('#chart-tooltip').style('opacity', 0);

        if (!data.length) {
            $('#chart-empty').prop('hidden', false);
            $('#chart-legend').html('<div class="legend-empty">Expenses will appear here once you import transactions.</div>');
            svg.attr('aria-label', 'No spending recorded');
            return;
        }

        $('#chart-empty').prop('hidden', true);
        const total = d3.sum(data, entry => entry.value);
        const width = 320;
        const height = 320;
        const outerRadius = 128;
        const innerRadius = 90;

        svg.attr('aria-label', 'Spending by category, total ' + money.format(total));

        const group = svg.append('g')
            .attr('transform', 'translate(' + (width / 2) + ',' + (height / 2) + ')');

        const pie = d3.pie()
            .value(entry => entry.value)
            .sort(null)
            .padAngle(0.013);

        const arc = d3.arc()
            .innerRadius(innerRadius)
            .outerRadius(outerRadius)
            .cornerRadius(4);

        const arcs = group.selectAll('path')
            .data(pie(data))
            .join('path')
            .attr('fill', entry => safeColor(entry.data.category.color))
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 1.5)
            .style('cursor', 'pointer');

        arcs.transition()
            .duration(650)
            .ease(d3.easeCubicOut)
            .attrTween('d', function (entry) {
                const interpolate = d3.interpolate(
                    { startAngle: entry.startAngle, endAngle: entry.startAngle },
                    entry);
                return t => arc(interpolate(t));
            });

        const center = group.append('g').attr('text-anchor', 'middle');
        const centerLabel = center.append('text')
            .attr('class', 'donut-label')
            .attr('y', -7)
            .text('SPENT');
        center.append('text')
            .attr('class', 'donut-value')
            .attr('y', 21)
            .text(money.format(total));

        const tooltip = d3.select('#chart-tooltip');
        const chartContainer = document.querySelector('.chart-visual');

        arcs
            .on('mouseenter', function (event, entry) {
                arcs.attr('opacity', other => (other === entry ? 1 : 0.35));
                centerLabel.text(truncate(entry.data.category.name, 22).toUpperCase());
            })
            .on('mousemove', function (event, entry) {
                const bounds = chartContainer.getBoundingClientRect();
                tooltip
                    .style('left', (event.clientX - bounds.left) + 'px')
                    .style('top', (event.clientY - bounds.top) + 'px')
                    .style('opacity', 1)
                    .text(entry.data.category.name + ' · ' + money.format(entry.data.value));
            })
            .on('mouseleave', function () {
                arcs.attr('opacity', 1);
                centerLabel.text('SPENT');
                tooltip.style('opacity', 0);
            });

        renderChartLegend(data, total);
    }

    function renderChartLegend(data, total) {
        const $legend = $('#chart-legend').empty();
        data.forEach(entry => {
            const percent = Math.round(entry.value / total * 100);
            $('<div>', { class: 'legend-row' }).append(
                $('<span>', { class: 'legend-dot' }).css('background-color', safeColor(entry.category.color)),
                $('<span>', { class: 'legend-name', text: entry.category.name, title: entry.category.name }),
                $('<span>', { class: 'legend-pct', text: percent + '%' }),
                $('<span>', { class: 'legend-value', text: money.format(entry.value) })
            ).appendTo($legend);
        });
    }

    /* ----------------------------------------------------------------------
       OFX import
       ---------------------------------------------------------------------- */

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

        showView('import');
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
        } catch (xhr) {
            showImportError(errorDetail(xhr));
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

    function renderImportRows(transactions) {
        const html = transactions.map((transaction, index) => {
            const category = getCategory(transaction.categoryId);
            const background = safeColor(category.color);
            const foreground = readableTextColor(background);
            const amount = transaction.amount === null || transaction.amount === undefined
                ? ''
                : Number(transaction.amount).toFixed(2);
            const billId = transaction.billId === null || transaction.billId === undefined
                ? 0
                : transaction.billId;

            return '<tr>'
                + '<td><select class="category-select" aria-label="Category, row ' + (index + 1) + '"'
                    + ' style="background-color:' + background + ';color:' + foreground + ';">'
                    + categoryOptions(transaction.categoryId) + '</select></td>'
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
                + '<td><input class="cell-input bill-input" type="number" step="1" min="0"'
                    + ' aria-label="Bill identifier, row ' + (index + 1) + '"'
                    + ' value="' + esc(billId) + '"></td>'
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

    function categoryOptions(selectedId) {
        const selected = Number(selectedId) || 0;
        const categories = [CATEGORY_NONE].concat(state.categories);
        if (!categories.some(category => Number(category.id) === selected)) {
            categories.push(getCategory(selected));
        }
        return categories.map(category => {
            const id = Number(category.id);
            return '<option value="' + id + '"' + (id === selected ? ' selected' : '') + '>'
                + esc(category.name) + '</option>';
        }).join('');
    }

    function paintCategorySelect(select) {
        const category = getCategory(select.value);
        const background = safeColor(category.color);
        select.style.backgroundColor = background;
        select.style.color = readableTextColor(background);
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

    function updateImportSummary() {
        const $rows = $('#import-tbody tr');
        let net = 0;
        $rows.each(function () {
            const raw = $(this).find('.amount-input').val();
            const amount = Number(raw);
            if (raw !== '' && Number.isFinite(amount)) {
                net += amount;
            }
        });

        $('#import-count').text($rows.length);
        $('#import-count-label').text($rows.length === 1 ? 'transaction' : 'transactions');
        $('#import-total').text($rows.length ? 'Net ' + money.format(net) : '');
        $('#save-all').prop('disabled', state.saving || $rows.length === 0);
        $('#save-all-top').prop('disabled', state.saving || $rows.length === 0);
    }

    /* ----------------------------------------------------------------------
       Save
       ---------------------------------------------------------------------- */

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
        showView('home');

        try {
            await refreshTransactions();
            $('#home-error').prop('hidden', true);
            renderHome();
        } catch (xhr) {
            showHomeError(errorDetail(xhr));
        }
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
            let billId = 0;
            if (billRaw !== '') {
                const parsedBill = Number(billRaw);
                if (!Number.isInteger(parsedBill) || parsedBill < 0) {
                    mark($bill);
                } else {
                    billId = parsedBill;
                }
            }

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
                billId: billId
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
    }

    /* ----------------------------------------------------------------------
       View helpers
       ---------------------------------------------------------------------- */

    function showView(name) {
        $('#home-view').prop('hidden', name !== 'home');
        $('#import-view').prop('hidden', name !== 'import');
        window.scrollTo(0, 0);
    }

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
        $('#import-filename').text('—');
    }

    function setTodayLabel() {
        const now = new Date();
        $('#today-label').text(now.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        }));
    }

    function toast(message, type) {
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

    function errorDetail(xhr) {
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

    /* ----------------------------------------------------------------------
       Formatting helpers
       ---------------------------------------------------------------------- */

    function getCategory(categoryId) {
        const id = Number(categoryId) || 0;
        if (id === 0) {
            return CATEGORY_NONE;
        }
        const category = state.categoryById.get(id);
        if (category) {
            return category;
        }
        return { id: id, name: 'Category #' + id, color: FALLBACK_COLOR };
    }

    function toNumber(value) {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function monthKey(date) {
        return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
    }

    function formatDate(isoDate) {
        if (!isoDate) {
            return '—';
        }
        const parts = String(isoDate).split('-');
        if (parts.length !== 3) {
            return String(isoDate);
        }
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }

    function safeColor(color) {
        const value = String(color || '').trim();
        return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : FALLBACK_COLOR;
    }

    function readableTextColor(background) {
        const rgb = hexToRgb(background);
        if (!rgb) {
            return '#152621';
        }
        const luminance = 0.2126 * linearChannel(rgb.r)
            + 0.7152 * linearChannel(rgb.g)
            + 0.0722 * linearChannel(rgb.b);
        const contrastWithWhite = 1.05 / (luminance + 0.05);
        const contrastWithBlack = (luminance + 0.05) / 0.05;
        return contrastWithWhite >= contrastWithBlack ? '#FFFFFF' : '#152621';
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

    function truncate(value, maxLength) {
        const text = String(value || '');
        return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
    }

    function esc(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

})(jQuery, d3);
