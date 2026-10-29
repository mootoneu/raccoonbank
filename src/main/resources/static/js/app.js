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
    const EARNED_COLOR = '#1F6B45';
    const OVERSPEND_COLOR = '#E4664F';
    const INK = '#152621';
    const WHITE_RGB = Object.freeze({ r: 255, g: 255, b: 255 });
    const INK_RGB = Object.freeze({ r: 21, g: 38, b: 33 });
    const MIN_CONTRAST = 4.5;
    const categoryPaletteCache = new Map();
    const MAX_FILE_SIZE = 10 * 1024 * 1024;

    const money = new Intl.NumberFormat('en-GB', {
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

    const state = {
        categories: [],
        categoryById: new Map(),
        transactions: [],
        importFileName: '',
        importOriginalCount: 0,
        importWarnings: [],
        saving: false,
        cashflowMonths: 24,
        cashflowResizeTimer: null,
        spendingRange: 'month',
        spendingMonth: null,
        spendingYear: null,
        spendingSelection: null,
        spendingCategories: new Set(),
        spendingGrouped: false,
        chartGrouped: false,
        editingTransactionId: null,
        transactionSort: { key: 'date', direction: 'desc' },
        transactionSelection: new Set(),
        transactionVisible: [],
        transactionFilterTimer: null,
        spendingData: null,
        spendingResizeTimer: null
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
        $('#brand-home, #nav-home').on('click', function (event) {
            event.preventDefault();
            navigateHome();
        });

        $('#nav-spending, #chart-view-all').on('click', openSpending);
        $('#spending-back-home').on('click', navigateHome);

        $('#nav-transactions').on('click', openTransactions);
        $('#transactions-back-home').on('click', navigateHome);
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
            .on('click', '.detail-edit-cancel', function () {
                state.editingTransactionId = null;
                renderTransactions();
            })
            .on('submit', '.detail-edit-form', function (event) {
                event.preventDefault();
                saveTransactionEdit(this);
            });

        $('#nav-admin').on('click', openAdmin);
        $('#admin-back-home').on('click', navigateHome);
        $('#admin-add-form').on('submit', submitNewCategory);
        $('#admin-id-form').on('submit', submitCategoryId);
        $('input[name="admin-add-placement"]').on('change', renderAdminPlacement);
        $('#admin-add-color').on('input change', renderAdminColor);
        $('#admin-add-name').on('input', function () {
            this.classList.remove('is-invalid');
        });
        $('#admin-id-category').on('change', renderAdminIdHint);
        $('#admin-id-new').on('input', renderAdminIdHint);
        $('#admin-delete-form').on('submit', submitDeleteCategory);
        $('#admin-delete-category').on('change', renderDeleteOptions);
        $('#admin-delete-replacement').on('change', renderDeleteHint);

        $('#import-btn, #import-btn-header, #empty-import-btn, #retry-import, #empty-retry-import, '
            + '#spending-import-btn, #histogram-import-btn').on('click', triggerFilePicker);

        $('#cashflow-range').on('click', '.segment-btn', function () {
            const months = Number(this.getAttribute('data-months'));
            if (!months || months === state.cashflowMonths) {
                return;
            }
            state.cashflowMonths = months;
            renderCashflow();
        });

        $('#spending-range').on('click', '.segment-btn', function () {
            const range = this.getAttribute('data-range');
            if (!range || range === state.spendingRange) {
                return;
            }
            state.spendingRange = range;
            closeSpendingDetail();
            ensureSpendingAnchors();
            renderSpending();
        });

        $('#period-prev').on('click', function () {
            moveSpendingPeriod(-1);
        });

        $('#period-next').on('click', function () {
            moveSpendingPeriod(1);
        });

        $('#spending-filter-btn').on('click', function (event) {
            event.stopPropagation();
            toggleSpendingFilter();
        });

        $('#spending-filter-panel').on('click', function (event) {
            event.stopPropagation();
        });

        $('#spending-filter-options').on('click', '.filter-chip', function () {
            onSpendingFilterChange(Number(this.getAttribute('data-category-id')) || 0);
        });

        $('#spending-filter-clear, #histogram-clear-filter').on('click', resetSpendingFilter);

        $('#chart-group-mode').on('change', function () {
            state.chartGrouped = this.checked;
            renderChart();
        });

        $('#spending-group-mode').on('change', function () {
            state.spendingGrouped = this.checked;
            state.spendingCategories.clear();
            closeSpendingFilter();
            closeSpendingDetail();
            renderSpending();
        });

        $(document).on('click', function () {
            closeSpendingFilter();
        });

        $('#detail-close').on('click', closeSpendingDetail);

        $('#detail-body')
            .on('click', '.detail-edit-btn', function () {
                state.editingTransactionId = Number(this.getAttribute('data-id'));
                renderSpendingDetail();
            })
            .on('click', '.detail-edit-cancel', function () {
                state.editingTransactionId = null;
                renderSpendingDetail();
            })
            .on('submit', '.detail-edit-form', function (event) {
                event.preventDefault();
                saveTransactionEdit(this);
            });

        $(document).on('keydown', function (event) {
            if (event.key !== 'Escape') {
                return;
            }
            if (isSpendingFilterOpen()) {
                closeSpendingFilter(true);
            } else if (!$('#spending-detail').prop('hidden')) {
                closeSpendingDetail();
            }
        });

        $(window).on('resize', function () {
            if (!$('#home-view').prop('hidden')) {
                window.clearTimeout(state.cashflowResizeTimer);
                state.cashflowResizeTimer = window.setTimeout(function () {
                    if (!$('#home-view').prop('hidden')) {
                        renderCashflow();
                    }
                }, 140);
            }

            if (!$('#spending-view').prop('hidden') && state.spendingData) {
                window.clearTimeout(state.spendingResizeTimer);
                state.spendingResizeTimer = window.setTimeout(function () {
                    if (!$('#spending-view').prop('hidden') && state.spendingData) {
                        renderHistogram(state.spendingData);
                    }
                }, 140);
            }
        });

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
            .on('click', '.row-default', function () {
                rememberDefaultCategory(this);
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
        ensureSpendingAnchors();
        showView('spending');
        renderSpending();
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

    /* ----------------------------------------------------------------------
       Initial data
       ---------------------------------------------------------------------- */

    async function loadInitialData() {
        try {
            const results = await Promise.all([
                $.getJSON('/api/categories'),
                $.getJSON('/api/transactions')
            ]);
            setCategories(results[0]);
            state.transactions = Array.isArray(results[1]) ? results[1] : [];
            $('#home-error').prop('hidden', true);
        } catch (xhr) {
            showHomeError(errorDetail(xhr));
        }
        renderHome();
        if (!$('#spending-view').prop('hidden')) {
            resetSpendingState();
            renderSpending();
        }
    }

    async function refreshTransactions() {
        state.transactions = await $.getJSON('/api/transactions');
    }

    function setCategories(list) {
        state.categories = Array.isArray(list) ? list : [];
        state.categoryById = new Map(state.categories.map(category => [Number(category.id), category]));
        state.categoryById.set(CATEGORY_NONE.id, CATEGORY_NONE);
    }

    async function refreshLedger() {
        const results = await Promise.all([
            $.getJSON('/api/categories'),
            $.getJSON('/api/transactions')
        ]);
        setCategories(results[0]);
        state.transactions = Array.isArray(results[1]) ? results[1] : [];
        resetSpendingState();
        renderHome();
        renderAdmin();
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
        renderCashflow();
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
        const palette = categoryPalette(category.color);
        return '<span class="chip" style="background-color:' + palette.background
            + ';color:' + palette.foreground + ';" title="' + esc(category.name) + '">'
            + esc(category.name) + '</span>';
    }

    /* ----------------------------------------------------------------------
       D3 donut chart
       ---------------------------------------------------------------------- */

    function renderChart() {
        const grouped = state.chartGrouped;
        const expenses = state.transactions.filter(transaction => toNumber(transaction.amount) < 0);
        const totals = d3.rollup(
            expenses,
            values => d3.sum(values, transaction => Math.abs(toNumber(transaction.amount))),
            transaction => grouped ? spendingGroupId(transaction) : (Number(transaction.categoryId) || 0));

        const data = Array.from(totals, entry => ({
            category: grouped ? spendingGroupCategory(entry[0]) : getCategory(entry[0]),
            value: entry[1]
        }))
            .filter(entry => entry.value > 0)
            .sort((a, b) => b.value - a.value);

        $('#chart-sub').text(grouped
            ? 'All saved expenses, grouped by category group.'
            : 'All saved expenses, grouped by category.');

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
       Overview cash flow chart
       ---------------------------------------------------------------------- */

    function buildCashflowModel() {
        const months = state.cashflowMonths;
        const today = new Date();
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const start = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);

        const buckets = Array.from({ length: months }, (_, index) => {
            const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
            return {
                key: monthKey(date),
                label: date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
                fullLabel: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
                earned: 0,
                spent: 0
            };
        });
        const bucketByKey = new Map(buckets.map(bucket => [bucket.key, bucket]));

        state.transactions.forEach(transaction => {
            const amount = toNumber(transaction.amount);
            const date = parseIsoDate(transaction.bankDate);
            if (!date || amount === 0) {
                return;
            }
            const bucket = bucketByKey.get(monthKey(date));
            if (!bucket) {
                return;
            }
            if (amount > 0) {
                bucket.earned += amount;
            } else {
                bucket.spent += Math.abs(amount);
            }
        });

        const earned = d3.sum(buckets, bucket => bucket.earned);
        const spent = d3.sum(buckets, bucket => bucket.spent);
        const last = new Date(end.getFullYear(), end.getMonth() - 1, 1);

        return {
            months: months,
            buckets: buckets,
            bucketByKey: bucketByKey,
            earned: earned,
            spent: spent,
            net: earned - spent,
            startLabel: start.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
            endLabel: last.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
        };
    }

    function renderCashflow() {
        const model = buildCashflowModel();

        $('#cashflow-range .segment-btn').each(function () {
            const active = Number(this.getAttribute('data-months')) === model.months;
            $(this).toggleClass('is-active', active).attr('aria-pressed', String(active));
        });

        $('#cashflow-earned').text(money.format(model.earned));
        $('#cashflow-spent').text(money.format(model.spent));
        $('#cashflow-net')
            .text(signedMoney(model.net))
            .toggleClass('positive', model.net > 0)
            .toggleClass('negative', model.net < 0);
        $('#cashflow-sub').text('Monthly totals · ' + model.startLabel + ' – ' + model.endLabel + '.');

        const svg = d3.select('#cashflow-chart');
        svg.selectAll('*').remove();
        d3.select('#cashflow-tooltip').style('opacity', 0).html('');

        const empty = model.earned <= 0 && model.spent <= 0;
        $('#cashflow-scroll').prop('hidden', empty);
        $('#cashflow-empty').prop('hidden', !empty);

        if (empty) {
            const hasTransactions = state.transactions.length > 0;
            $('#cashflow-empty-text').text(hasTransactions
                ? 'No earnings or spending in the last ' + model.months + ' months.'
                : 'Once you import transactions, your monthly earnings and spending will appear here.');
            svg.attr('aria-label', 'No earnings or spending in the last ' + model.months + ' months');
            return;
        }

        svg.attr('aria-label', 'Earnings and spending for the last ' + model.months + ' months, '
            + model.startLabel + ' to ' + model.endLabel + '. Earned ' + money.format(model.earned)
            + ', spent ' + money.format(model.spent) + ', net ' + signedMoney(model.net) + '.');

        const scroll = document.getElementById('cashflow-scroll');
        const available = Math.max(scroll.clientWidth - 2, 280);
        const margin = { top: 16, right: 14, bottom: 36, left: 58 };
        const innerWidth = Math.max(available - margin.left - margin.right, 220);
        const width = Math.round(innerWidth + margin.left + margin.right);
        const height = 300;
        const innerHeight = height - margin.top - margin.bottom;

        svg
            .attr('viewBox', '0 0 ' + width + ' ' + height)
            .attr('width', width)
            .attr('height', height);

        const root = svg.append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        const x = d3.scaleBand()
            .domain(model.buckets.map(bucket => bucket.key))
            .range([0, innerWidth])
            .paddingInner(0.22)
            .paddingOuter(0.06);

        const maxValue = Math.max(
            d3.max(model.buckets, bucket => bucket.earned) || 0,
            d3.max(model.buckets, bucket => bucket.spent) || 0) || 1;
        const y = d3.scaleLinear()
            .domain([0, maxValue])
            .nice()
            .range([innerHeight, 0]);

        const yAxis = root.append('g')
            .attr('class', 'cashflow-y-axis')
            .call(d3.axisLeft(y)
                .ticks(5)
                .tickSize(-innerWidth)
                .tickFormat(value => compactMoney(value)));
        yAxis.select('.domain').remove();
        yAxis.selectAll('.tick line')
            .attr('stroke', '#EFEAE0')
            .attr('stroke-dasharray', '2 3');
        yAxis.selectAll('.tick text')
            .attr('x', -10)
            .attr('fill', '#5F6D68')
            .style('font-size', '10.5px');

        const tickEvery = Math.max(1, Math.ceil(40 / x.bandwidth()));
        const tickIndices = [];
        for (let index = 0; index < model.buckets.length; index += tickEvery) {
            tickIndices.push(index);
        }
        const lastIndex = model.buckets.length - 1;
        if (tickIndices[tickIndices.length - 1] !== lastIndex) {
            if (lastIndex - tickIndices[tickIndices.length - 1] < tickEvery) {
                tickIndices.pop();
            }
            tickIndices.push(lastIndex);
        }
        const tickKeys = tickIndices.map(index => model.buckets[index].key);
        const xAxis = root.append('g')
            .attr('class', 'cashflow-x-axis')
            .attr('transform', 'translate(0,' + innerHeight + ')')
            .call(d3.axisBottom(x)
                .tickValues(tickKeys)
                .tickFormat(key => model.bucketByKey.get(key).label)
                .tickSize(0)
                .tickPadding(9));
        xAxis.select('.domain').attr('stroke', '#E6E0D3');
        xAxis.selectAll('.tick text')
            .attr('fill', '#5F6D68')
            .style('font-size', '10.5px')
            .style('font-weight', '600')
            .attr('text-anchor', (key, index, nodes) => {
                if (index === nodes.length - 1) {
                    return 'end';
                }
                return index === 0 ? 'start' : 'middle';
            });

        const x1 = d3.scaleBand()
            .domain(['earned', 'spent'])
            .range([0, x.bandwidth()])
            .padding(0.24);

        const groups = root.append('g')
            .attr('class', 'cashflow-bars')
            .selectAll('g')
            .data(model.buckets)
            .join('g')
            .attr('class', 'cashflow-month')
            .attr('transform', bucket => 'translate(' + x(bucket.key) + ',0)');

        groups.append('rect')
            .attr('class', 'cashflow-bar earned')
            .attr('x', x1('earned'))
            .attr('width', x1.bandwidth())
            .attr('y', bucket => y(bucket.earned))
            .attr('height', bucket => cashflowBarHeight(bucket.earned, y, innerHeight))
            .attr('rx', Math.min(3, x1.bandwidth() / 3));

        groups.append('rect')
            .attr('class', 'cashflow-bar spent')
            .attr('x', x1('spent'))
            .attr('width', x1.bandwidth())
            .attr('y', bucket => y(bucket.spent))
            .attr('height', bucket => cashflowBarHeight(bucket.spent, y, innerHeight))
            .attr('rx', Math.min(3, x1.bandwidth() / 3));

        groups.append('rect')
            .attr('class', 'cashflow-hit')
            .attr('x', 0)
            .attr('width', x.bandwidth())
            .attr('y', 0)
            .attr('height', innerHeight)
            .attr('fill', 'transparent')
            .attr('pointer-events', 'all');

        const tooltip = d3.select('#cashflow-tooltip');
        groups
            .on('mouseenter', function (event, bucket) {
                groups.classed('is-dim', other => other !== bucket);
                tooltip.html(cashflowTooltip(bucket)).style('opacity', 1);
            })
            .on('mousemove', function (event) {
                const node = tooltip.node();
                const tipWidth = node.offsetWidth || 190;
                const tipHeight = node.offsetHeight || 96;
                const half = tipWidth / 2 + 12;
                const left = Math.min(Math.max(event.clientX, half), window.innerWidth - half);
                const flip = event.clientY - tipHeight - 20 < 4;
                tooltip
                    .classed('is-below', flip)
                    .style('left', left + 'px')
                    .style('top', event.clientY + 'px');
            })
            .on('mouseleave', function () {
                groups.classed('is-dim', false);
                tooltip.style('opacity', 0);
            });
    }

    function cashflowBarHeight(value, y, innerHeight) {
        if (value <= 0) {
            return 0;
        }
        return Math.max(1.5, innerHeight - y(value));
    }

    function cashflowTooltip(bucket) {
        return '<span class="cf-tt-month">' + esc(bucket.fullLabel) + '</span>'
            + '<span class="cf-tt-row"><span class="cf-tt-dot income"></span>'
            + '<span>Earned</span><b>' + esc(money.format(bucket.earned)) + '</b></span>'
            + '<span class="cf-tt-row"><span class="cf-tt-dot expense"></span>'
            + '<span>Spent</span><b>' + esc(money.format(bucket.spent)) + '</b></span>'
            + '<span class="cf-tt-net">Net <b>' + esc(signedMoney(bucket.earned - bucket.spent)) + '</b></span>';
    }

    function signedMoney(value) {
        return (value > 0 ? '+' : '') + money.format(value);
    }

    /* ----------------------------------------------------------------------
       Spending histogram by category
       ---------------------------------------------------------------------- */

    function ensureSpendingAnchors() {
        const source = spendingSource();
        const latest = d3.max(source, entry => entry.date);
        const base = latest || new Date();
        if (!state.spendingMonth) {
            state.spendingMonth = monthKey(base);
        }
        if (state.spendingYear === null || state.spendingYear === undefined) {
            state.spendingYear = base.getFullYear();
        }
    }

    function spendingSource() {
        return state.transactions
            .map(transaction => {
                const amount = toNumber(transaction.amount);
                const date = parseIsoDate(transaction.bankDate);
                if (amount >= 0 || !date) {
                    return null;
                }
                return { transaction: transaction, date: date, amount: Math.abs(amount) };
            })
            .filter(Boolean);
    }

    function earningSource() {
        return state.transactions
            .map(transaction => {
                const amount = toNumber(transaction.amount);
                const date = parseIsoDate(transaction.bankDate);
                if (amount <= 0 || !date) {
                    return null;
                }
                return { transaction: transaction, date: date, amount: amount };
            })
            .filter(Boolean);
    }

    function spendingBounds(source) {
        const months = source.map(entry => monthKey(entry.date)).sort();
        const years = source.map(entry => entry.date.getFullYear()).sort((a, b) => a - b);
        return {
            minMonth: months.length ? months[0] : null,
            maxMonth: months.length ? months[months.length - 1] : null,
            minYear: years.length ? years[0] : null,
            maxYear: years.length ? years[years.length - 1] : null
        };
    }

    /* ----------------------------------------------------------------------
       Spending grouping (category or category group)
       ---------------------------------------------------------------------- */

    function spendingGroupId(transaction) {
        const categoryId = Number(transaction.categoryId) || 0;
        if (categoryId === 0) {
            return 0;
        }
        const category = state.categoryById.get(categoryId);
        return category ? (Number(category.groupId) || 0) : 0;
    }

    function spendingEntryKey(transaction) {
        return state.spendingGrouped
            ? spendingGroupId(transaction)
            : (Number(transaction.categoryId) || 0);
    }

    function spendingGroupCategory(groupId) {
        const id = Number(groupId) || 0;
        if (id === 0) {
            return CATEGORY_NONE;
        }
        const members = state.categories.filter(category => Number(category.groupId) === id);
        if (!members.length) {
            return { id: id, name: 'Group #' + id, color: FALLBACK_COLOR };
        }
        const root = members.find(category => Number(category.subId) === 0);
        if (root) {
            return root;
        }
        return {
            id: id,
            name: members[0].groupName || members[0].name,
            color: members[0].color
        };
    }

    function spendingDisplayCategory(key) {
        return state.spendingGrouped ? spendingGroupCategory(key) : getCategory(key);
    }

    function spendingBucketLabel() {
        return state.spendingGrouped ? 'group' : 'category';
    }

    /* ----------------------------------------------------------------------
       Spending category filter
       ---------------------------------------------------------------------- */

    function categoryInSpendingFilter(transaction) {
        return state.spendingCategories.size === 0
            || state.spendingCategories.has(spendingEntryKey(transaction));
    }

    function spendingFilterOptions() {
        const keys = new Set();
        spendingSource().forEach(entry => {
            keys.add(spendingEntryKey(entry.transaction));
        });
        return Array.from(keys)
            .map(key => ({ key: key, category: spendingDisplayCategory(key) }))
            .sort((a, b) => a.key - b.key);
    }

    function spendingFilterLabel(options) {
        const selected = state.spendingCategories.size;
        const noun = state.spendingGrouped ? 'group' : 'category';
        if (selected === 0) {
            return state.spendingGrouped ? 'All groups' : 'All categories';
        }
        if (selected === 1) {
            const only = options.find(option =>
                state.spendingCategories.has(Number(option.key)));
            return only ? only.category.name : '1 ' + noun;
        }
        return selected + ' ' + noun + 's';
    }

    function renderSpendingFilter() {
        const options = spendingFilterOptions();
        const available = new Set(options.map(option => Number(option.key)));
        Array.from(state.spendingCategories).forEach(id => {
            if (!available.has(id)) {
                state.spendingCategories.delete(id);
            }
        });

        const noun = state.spendingGrouped ? 'group' : 'category';
        $('#spending-filter-title').text('Filter by ' + noun);
        $('#spending-filter-options').attr('aria-label', 'Filter spending by ' + noun);
        $('#histogram-legend').attr('aria-label',
            (state.spendingGrouped ? 'Group' : 'Category') + ' totals for this period');

        const $options = $('#spending-filter-options').empty();
        if (!options.length) {
            $('<p>', {
                class: 'filter-empty',
                text: 'No ' + noun + 's with spending yet.'
            }).appendTo($options);
        } else {
            options.forEach(option => {
                const id = Number(option.key);
                const category = option.category;
                const active = state.spendingCategories.has(id);
                const palette = categoryPalette(category.color);
                $('<button>', {
                    type: 'button',
                    class: 'filter-chip' + (active ? ' is-active' : ''),
                    'data-category-id': id,
                    'aria-pressed': String(active),
                    text: category.name,
                    title: category.name
                }).css({
                    backgroundColor: palette.background,
                    color: palette.foreground
                }).appendTo($options);
            });
        }

        const filtering = state.spendingCategories.size > 0;
        $('#spending-filter-label').text(spendingFilterLabel(options));
        $('#spending-filter-btn')
            .toggleClass('is-filtering', filtering)
            .attr('title', filtering
                ? 'Showing ' + spendingFilterLabel(options).toLowerCase()
                : (state.spendingGrouped ? 'All groups' : 'All categories'));
        $('#spending-filter-clear').prop('disabled', !filtering);
        $('#histogram-clear-filter')
            .prop('hidden', !filtering)
            .text('Reset ' + noun + ' filter');
    }

    function isSpendingFilterOpen() {
        return !$('#spending-filter-panel').prop('hidden');
    }

    function openSpendingFilter() {
        $('#spending-filter-panel').prop('hidden', false);
        $('#spending-filter-btn').attr('aria-expanded', 'true');
    }

    function closeSpendingFilter(focusButton) {
        if (!isSpendingFilterOpen()) {
            return;
        }
        $('#spending-filter-panel').prop('hidden', true);
        $('#spending-filter-btn').attr('aria-expanded', 'false');
        if (focusButton) {
            $('#spending-filter-btn').trigger('focus');
        }
    }

    function toggleSpendingFilter() {
        if (isSpendingFilterOpen()) {
            closeSpendingFilter();
        } else {
            openSpendingFilter();
        }
    }

    function onSpendingFilterChange(categoryId) {
        const active = document.activeElement;
        const restoreFocus = active && active.classList
            && active.classList.contains('filter-chip');
        if (state.spendingCategories.has(categoryId)) {
            state.spendingCategories.delete(categoryId);
        } else {
            state.spendingCategories.add(categoryId);
        }
        closeSpendingDetail();
        renderSpending();
        if (restoreFocus) {
            const next = document.querySelector(
                '#spending-filter-options .filter-chip[data-category-id="' + categoryId + '"]');
            if (next) {
                next.focus();
            }
        }
    }

    function resetSpendingFilter() {
        if (!state.spendingCategories.size) {
            return;
        }
        state.spendingCategories.clear();
        closeSpendingDetail();
        renderSpending();
    }

    function moveSpendingPeriod(direction) {
        if (state.spendingRange === 'month') {
            const parts = state.spendingMonth.split('-').map(Number);
            state.spendingMonth = monthKey(new Date(parts[0], parts[1] - 1 + direction, 1));
            state.spendingYear = Number(state.spendingMonth.slice(0, 4));
        } else if (state.spendingRange === 'year') {
            state.spendingYear += direction;
            const monthPart = state.spendingMonth ? state.spendingMonth.slice(5) : '01';
            state.spendingMonth = state.spendingYear + '-' + monthPart;
        } else {
            return;
        }
        closeSpendingDetail();
        renderSpending();
    }

    function buildSpendingModel() {
        ensureSpendingAnchors();

        const range = state.spendingRange;
        const source = spendingSource();
        const earnings = earningSource();
        const bounds = spendingBounds(source.concat(earnings));
        let start;
        let end;
        let buckets = [];
        let periodLabel;
        let rangeTag;
        let unit;

        if (range === 'month') {
            const parts = state.spendingMonth.split('-').map(Number);
            const year = parts[0];
            const month = parts[1];
            const first = new Date(year, month - 1, 1);
            const days = new Date(year, month, 0).getDate();
            start = first;
            end = new Date(year, month, 1);
            periodLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
            rangeTag = periodLabel;
            unit = 'day';
            buckets = Array.from({ length: days }, (_, index) => {
                const date = new Date(year, month - 1, index + 1);
                return spendingBucket(isoDay(date), String(index + 1), formatLongDate(date));
            });
        } else if (range === 'year') {
            const year = Number(state.spendingYear);
            start = new Date(year, 0, 1);
            end = new Date(year + 1, 0, 1);
            periodLabel = String(year);
            rangeTag = String(year);
            unit = 'month';
            buckets = Array.from({ length: 12 }, (_, index) => {
                const date = new Date(year, index, 1);
                return spendingBucket(
                    monthKey(date),
                    date.toLocaleDateString('en-GB', { month: 'short' }),
                    date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
            });
        } else {
            const firstYear = bounds.minYear === null ? new Date().getFullYear() : bounds.minYear;
            const lastYear = bounds.maxYear === null ? firstYear : bounds.maxYear;
            start = new Date(firstYear, 0, 1);
            end = new Date(lastYear + 1, 0, 1);
            periodLabel = 'All time';
            rangeTag = firstYear === lastYear ? String(firstYear) : firstYear + '–' + lastYear;
            unit = 'year';
            for (let year = firstYear; year <= lastYear; year += 1) {
                buckets.push(spendingBucket(String(year), String(year), String(year)));
            }
        }

        const bucketByKey = new Map(buckets.map(bucket => [bucket.key, bucket]));
        const rangeSource = source.filter(entry =>
            entry.date >= start
            && entry.date < end
            && categoryInSpendingFilter(entry.transaction));
        const categoryTotals = new Map();

        rangeSource.forEach(entry => {
            const key = spendingBucketKey(range, entry.date);
            const bucket = bucketByKey.get(key);
            if (!bucket) {
                return;
            }
            const categoryKey = spendingEntryKey(entry.transaction);
            bucket.transactions.push(entry);
            bucket.total += entry.amount;
            bucket.values.set(categoryKey, (bucket.values.get(categoryKey) || 0) + entry.amount);
            bucket.counts.set(categoryKey, (bucket.counts.get(categoryKey) || 0) + 1);
            categoryTotals.set(categoryKey, (categoryTotals.get(categoryKey) || 0) + entry.amount);
        });

        let earned = 0;
        earnings.forEach(entry => {
            if (entry.date < start || entry.date >= end) {
                return;
            }
            const bucket = bucketByKey.get(spendingBucketKey(range, entry.date));
            if (bucket) {
                bucket.earned += entry.amount;
                earned += entry.amount;
            }
        });

        const categories = Array.from(categoryTotals, entry => ({
            id: entry[0],
            category: spendingDisplayCategory(entry[0]),
            total: entry[1]
        }))
            .filter(entry => entry.total > 0)
            .sort((a, b) => a.id - b.id);

        return {
            range: range,
            buckets: buckets,
            bucketByKey: bucketByKey,
            categories: categories,
            rangeSource: rangeSource,
            total: d3.sum(rangeSource, entry => entry.amount),
            earned: earned,
            count: rangeSource.length,
            start: start,
            end: end,
            periodLabel: periodLabel,
            rangeTag: rangeTag,
            unit: unit,
            bounds: bounds
        };
    }

    function spendingBucketKey(range, date) {
        if (range === 'month') {
            return isoDay(date);
        }
        return range === 'year' ? monthKey(date) : String(date.getFullYear());
    }

    function spendingBucket(key, label, fullLabel) {
        return {
            key: key,
            label: label,
            fullLabel: fullLabel,
            transactions: [],
            values: new Map(),
            counts: new Map(),
            total: 0,
            earned: 0
        };
    }

    function renderSpending() {
        renderSpendingFilter();
        const model = buildSpendingModel();
        state.spendingData = model;
        renderSpendingStats(model);
        renderPeriodControls(model);
        renderSpendingLegend(model);
        renderHistogram(model);
        if (state.spendingSelection) {
            renderSpendingDetail();
        }
    }

    function renderSpendingStats(model) {
        const average = model.buckets.length ? model.total / model.buckets.length : 0;
        const top = model.categories.reduce(
            (best, entry) => (!best || entry.total > best.total ? entry : best),
            null);

        $('#spending-total').text(money.format(model.total));
        $('#spending-total-sub').text(model.rangeTag);
        $('#spending-earned').text(money.format(model.earned));
        $('#spending-earned-sub').text('Net ' + signedMoney(model.earned - model.total));
        $('#spending-count').text(model.count);
        $('#spending-count-sub').text(
            model.count
                ? money.format(average) + ' avg / ' + model.unit
                : 'No spending in this period');

        if (top) {
            $('#spending-top')
                .text(top.category.name)
                .attr('title', top.category.name);
            $('#spending-top-sub').text(
                money.format(top.total) + ' · ' + Math.round(top.total / model.total * 100) + '% of spending');
        } else {
            $('#spending-top').text('—').removeAttr('title');
            $('#spending-top-sub').text(
                state.spendingGrouped ? 'No group to rank' : 'No category to rank');
        }
        $('#spending-top-label').text(state.spendingGrouped ? 'Top group' : 'Top category');
    }

    function renderPeriodControls(model) {
        $('#spending-range .segment-btn').each(function () {
            const active = this.getAttribute('data-range') === model.range;
            $(this).toggleClass('is-active', active).attr('aria-pressed', String(active));
        });

        const hasData = model.bounds.minMonth !== null;
        const prevDisabled = !hasData || (model.range === 'month'
            ? state.spendingMonth <= model.bounds.minMonth
            : state.spendingYear <= model.bounds.minYear);
        const nextDisabled = !hasData || (model.range === 'month'
            ? state.spendingMonth >= model.bounds.maxMonth
            : state.spendingYear >= model.bounds.maxYear);

        $('#period-nav').prop('hidden', model.range === 'all');
        $('#period-label').text(model.periodLabel);
        $('#period-prev').prop('disabled', prevDisabled);
        $('#period-next').prop('disabled', nextDisabled);

        const barText = {
            month: 'Each bar is a day',
            year: 'Each bar is a month',
            all: 'Each bar is a year'
        };
        const description = barText[model.range] + ', stacked by ' + spendingBucketLabel();
        $('#histogram-sub').text(description + '. The line traces earnings for the same period.');
        $('#spending-subtitle').text(
            barText[model.range] + '. Click a colored segment to see the transactions behind it.');
        $('#histogram-range-tag').text(model.rangeTag);
    }

    function renderSpendingLegend(model) {
        const $legend = $('#histogram-legend').empty();
        if (!model.rangeSource.length && !model.earned) {
            $legend.prop('hidden', true);
            return;
        }

        $legend.prop('hidden', false);
        const over = overspentBuckets(model).length;
        $('<div>', {
            class: 'hist-legend-item',
            title: 'Earnings · ' + money.format(model.earned)
        }).append(
            $('<span>', { class: 'legend-dot' }).css('background-color', EARNED_COLOR),
            $('<span>', { class: 'hist-legend-name', text: 'Earned (line)' }),
            $('<span>', { class: 'hist-legend-value', text: money.format(model.earned) })
        ).appendTo($legend);
        $('<div>', {
            class: 'hist-legend-item',
            title: 'Periods where spending is higher than earnings'
        }).append(
            $('<span>', { class: 'legend-dot' }).css('background-color', OVERSPEND_COLOR),
            $('<span>', { class: 'hist-legend-name', text: 'Spent more than earned' }),
            $('<span>', {
                class: 'hist-legend-value',
                text: over + ' of ' + model.buckets.length + ' ' + model.unit + (model.buckets.length === 1 ? '' : 's')
            })
        ).appendTo($legend);

        model.categories.forEach(entry => {
            $('<div>', {
                class: 'hist-legend-item',
                title: entry.category.name + ' · ' + money.format(entry.total)
            }).append(
                $('<span>', { class: 'legend-dot' }).css('background-color', safeColor(entry.category.color)),
                $('<span>', { class: 'hist-legend-name', text: entry.category.name }),
                $('<span>', { class: 'hist-legend-value', text: money.format(entry.total) })
            ).appendTo($legend);
        });
    }

    function renderHistogram(model) {
        const svg = d3.select('#spending-histogram');
        svg.selectAll('*').remove();
        d3.select('#histogram-tooltip').style('opacity', 0).html('');

        const empty = !model.rangeSource.length && !model.earned;
        $('#histogram-empty').prop('hidden', !empty);
        $('#histogram-scroll').prop('hidden', empty);

        if (empty) {
            const hasSpending = spendingSource().length > 0;
            const filtering = state.spendingCategories.size > 0;
            if (filtering) {
                const noun = spendingBucketLabel();
                $('#histogram-empty-title').text('Nothing in the selected ' + noun + 's');
                $('#histogram-empty-text').text(
                    'No transaction in these ' + noun + 's for this period. Reset the filter or try another period.');
            } else {
                $('#histogram-empty-title').text(hasSpending ? 'Nothing spent in this period' : 'No spending yet');
                $('#histogram-empty-text').text(hasSpending
                    ? 'Try another period or switch how the bars are grouped.'
                    : 'Import an OFX statement to see where your money goes.');
            }
            $('#histogram-import-btn').prop('hidden', hasSpending);
            $('#histogram-clear-filter').prop('hidden', !filtering);
            svg.attr('aria-label', filtering
                ? 'No spending in the selected categories'
                : 'No spending in this period');
            return;
        }

        const scroll = document.getElementById('histogram-scroll');
        const available = Math.max(scroll.clientWidth - 2, 300);
        const margin = { top: 14, right: 16, bottom: 38, left: 58 };
        const minBand = model.range === 'month' ? 20 : (model.range === 'year' ? 32 : 56);
        const plotWidth = Math.max(
            available - margin.left - margin.right,
            model.buckets.length * minBand);
        const width = Math.round(plotWidth + margin.left + margin.right);
        const height = 384;
        const innerHeight = height - margin.top - margin.bottom;

        svg
            .attr('viewBox', '0 0 ' + width + ' ' + height)
            .attr('width', width)
            .attr('height', height)
            .attr('aria-label', 'Spending histogram for ' + model.periodLabel
                + ', total ' + money.format(model.total));

        const root = svg.append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

        const x = d3.scaleBand()
            .domain(model.buckets.map(bucket => bucket.key))
            .range([0, plotWidth])
            .paddingInner(model.buckets.length === 1 ? 0.55 : 0.26)
            .paddingOuter(0.08);

        const maxTotal = d3.max(model.buckets, bucket => Math.max(bucket.total, bucket.earned)) || 1;
        const y = d3.scaleLinear()
            .domain([0, maxTotal])
            .nice()
            .range([innerHeight, 0]);

        const yAxis = root.append('g')
            .attr('class', 'histogram-y-axis')
            .call(d3.axisLeft(y)
                .ticks(5)
                .tickSize(-plotWidth)
                .tickFormat(value => compactMoney(value)));
        yAxis.select('.domain').remove();
        yAxis.selectAll('.tick line')
            .attr('stroke', '#EFEAE0')
            .attr('stroke-dasharray', '2 3');
        yAxis.selectAll('.tick text')
            .attr('x', -10)
            .attr('fill', '#5F6D68')
            .style('font-size', '10.5px');

        const tickKeys = spendingTickKeys(model);
        const xAxis = root.append('g')
            .attr('class', 'histogram-x-axis')
            .attr('transform', 'translate(0,' + innerHeight + ')')
            .call(d3.axisBottom(x)
                .tickValues(tickKeys)
                .tickFormat(key => model.bucketByKey.get(key).label)
                .tickSize(0)
                .tickPadding(10));
        xAxis.select('.domain').attr('stroke', '#E6E0D3');
        xAxis.selectAll('.tick text')
            .attr('fill', '#5F6D68')
            .style('font-size', '10.5px')
            .style('font-weight', '600');

        const keys = model.categories.map(entry => 'c' + entry.id);
        const rows = model.buckets.map(bucket => {
            const row = { bucket: bucket };
            model.categories.forEach(entry => {
                row['c' + entry.id] = bucket.values.get(entry.id) || 0;
            });
            return row;
        });

        const stack = d3.stack().keys(keys)(rows);
        const layers = root.append('g')
            .attr('class', 'histogram-bars')
            .selectAll('g')
            .data(stack)
            .join('g')
            .attr('fill', series => {
                const entry = model.categories.find(category => 'c' + category.id === series.key);
                return safeColor(entry.category.color);
            });

        const segments = layers.selectAll('rect')
            .data(series => {
                const entry = model.categories.find(category => 'c' + category.id === series.key);
                return series.map(segment => ({
                    bucket: segment.data.bucket,
                    key: entry.id,
                    category: entry.category,
                    amount: segment[1] - segment[0],
                    y0: segment[0],
                    y1: segment[1]
                })).filter(segment => segment.amount > 0.004);
            })
            .join('rect')
            .attr('class', 'hist-segment')
            .attr('x', segment => x(segment.bucket.key))
            .attr('width', Math.max(1, x.bandwidth()))
            .attr('y', segment => y(segment.y1))
            .attr('height', segment => Math.max(0.8, y(segment.y0) - y(segment.y1)))
            .attr('rx', Math.min(2.5, x.bandwidth() / 4))
            .attr('stroke', '#FFFFFF')
            .attr('stroke-width', 0.8)
            .attr('tabindex', 0)
            .attr('role', 'button')
            .attr('aria-label', segment => segment.category.name + ', ' + segment.bucket.fullLabel
                + ', ' + money.format(segment.amount) + '. Show transactions.')
            .classed('is-selected', segment => isSpendingSelected(segment));

        drawOverspendMarkers(root, model, x, y);
        drawEarningsLine(root, model, x, y);

        const tooltip = d3.select('#histogram-tooltip');

        segments
            .on('mouseenter', function (event, segment) {
                segments.attr('opacity', other => (other === segment ? 1 : 0.3));
                d3.select(this).attr('stroke', '#152621').attr('stroke-width', 1.4);
                const count = segment.bucket.counts.get(segment.key) || 0;
                tooltip
                    .html('<span class="tt-category">' + esc(segment.category.name) + '</span>'
                        + '<span class="tt-meta">' + esc(segment.bucket.fullLabel) + '</span>'
                        + '<span class="tt-value">' + esc(money.format(segment.amount))
                        + ' · ' + count + (count === 1 ? ' transaction' : ' transactions') + '</span>')
                    .style('opacity', 1);
            })
            .on('mousemove', function (event) {
                tooltip
                    .style('left', Math.min(Math.max(event.clientX, 90), window.innerWidth - 90) + 'px')
                    .style('top', Math.max(event.clientY, 70) + 'px');
            })
            .on('mouseleave', function () {
                segments.attr('opacity', 1);
                d3.select(this).attr('stroke', '#FFFFFF').attr('stroke-width', 0.8);
                tooltip.style('opacity', 0);
            })
            .on('click', function (event, segment) {
                selectSpendingSegment(segment.key, segment.bucket.key);
            })
            .on('keydown', function (event, segment) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectSpendingSegment(segment.key, segment.bucket.key);
                }
            });
    }

    function overspentBuckets(model) {
        return model.buckets.filter(bucket => bucket.total > bucket.earned + 0.005);
    }

    function drawOverspendMarkers(root, model, x, y) {
        root.append('g')
            .attr('class', 'histogram-overspend')
            .selectAll('circle')
            .data(overspentBuckets(model))
            .join('circle')
            .attr('cx', bucket => x(bucket.key) + x.bandwidth() / 2)
            .attr('cy', bucket => y(bucket.total) - 7)
            .attr('r', Math.min(3.5, Math.max(2, x.bandwidth() / 5)))
            .attr('fill', OVERSPEND_COLOR)
            .attr('stroke', '#FFFFFF')
            .attr('stroke-width', 1)
            .attr('pointer-events', 'none');
    }

    function drawEarningsLine(root, model, x, y) {
        const half = x.bandwidth() / 2;
        const points = model.buckets.map(bucket => ({
            bucket: bucket,
            cx: x(bucket.key) + half,
            cy: y(bucket.earned)
        }));
        const path = d3.line().x(point => point.cx).y(point => point.cy)(points);
        const group = root.append('g').attr('class', 'histogram-earned');

        group.append('path')
            .attr('class', 'earned-halo')
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', '#FFFFFF')
            .attr('stroke-width', 5)
            .attr('stroke-linejoin', 'round')
            .attr('stroke-linecap', 'round')
            .attr('pointer-events', 'none');
        group.append('path')
            .attr('class', 'earned-line')
            .attr('d', path)
            .attr('fill', 'none')
            .attr('stroke', EARNED_COLOR)
            .attr('stroke-width', 2.4)
            .attr('stroke-linejoin', 'round')
            .attr('stroke-linecap', 'round')
            .attr('pointer-events', 'none');

        const tooltip = d3.select('#histogram-tooltip');
        group.selectAll('circle')
            .data(points)
            .join('circle')
            .attr('class', 'earned-dot')
            .attr('cx', point => point.cx)
            .attr('cy', point => point.cy)
            .attr('r', model.buckets.length > 40 ? 2.6 : 3.6)
            .attr('fill', '#FFFFFF')
            .attr('stroke', EARNED_COLOR)
            .attr('stroke-width', 1.8)
            .on('mouseenter', function (event, point) {
                const bucket = point.bucket;
                const net = bucket.earned - bucket.total;
                tooltip
                    .html('<span class="tt-category">Earned ' + esc(money.format(bucket.earned)) + '</span>'
                        + '<span class="tt-meta">' + esc(bucket.fullLabel) + '</span>'
                        + '<span class="tt-value">Spent ' + esc(money.format(bucket.total))
                        + ' · Net ' + esc(signedMoney(net)) + '</span>')
                    .style('opacity', 1);
            })
            .on('mousemove', function (event) {
                tooltip
                    .style('left', Math.min(Math.max(event.clientX, 90), window.innerWidth - 90) + 'px')
                    .style('top', Math.max(event.clientY, 70) + 'px');
            })
            .on('mouseleave', function () {
                tooltip.style('opacity', 0);
            });
    }

    function spendingTickKeys(model) {
        const keys = model.buckets.map(bucket => bucket.key);
        if (model.range === 'month') {
            const last = model.buckets.length;
            const days = new Set([1, 5, 10, 15, 20, 25, last]);
            return keys.filter((key, index) => days.has(index + 1));
        }
        if (model.range === 'all' && keys.length > 10) {
            const step = Math.ceil(keys.length / 8);
            return keys.filter((key, index) => index % step === 0 || index === keys.length - 1);
        }
        return keys;
    }

    function isSpendingSelected(segment) {
        const selection = state.spendingSelection;
        return Boolean(selection
            && selection.key === segment.key
            && selection.bucketKey === segment.bucket.key);
    }

    function applySpendingSelection() {
        d3.selectAll('#spending-histogram .hist-segment')
            .classed('is-selected', segment => isSpendingSelected(segment));
    }

    function selectSpendingSegment(key, bucketKey) {
        state.editingTransactionId = null;
        state.spendingSelection = {
            key: Number(key) || 0,
            bucketKey: String(bucketKey)
        };
        applySpendingSelection();
        renderSpendingDetail();
    }

    function renderSpendingDetail() {
        const model = state.spendingData;
        const selection = state.spendingSelection;
        if (!model || !selection) {
            $('#spending-detail').prop('hidden', true);
            return;
        }

        const bucket = model.buckets.find(candidate => candidate.key === selection.bucketKey);
        const items = bucket
            ? bucket.transactions
                .filter(entry => spendingEntryKey(entry.transaction) === selection.key)
                .sort((a, b) => b.date - a.date
                    || (Number(b.transaction.id) || 0) - (Number(a.transaction.id) || 0))
            : [];

        if (!items.length) {
            closeSpendingDetail();
            return;
        }

        const category = spendingDisplayCategory(selection.key);
        const total = d3.sum(items, entry => entry.amount);
        const preposition = model.range === 'month' ? 'on' : 'in';
        const summary = items.length + (items.length === 1 ? ' transaction ' : ' transactions ')
            + preposition + ' ' + bucket.fullLabel;

        $('#detail-bucket').text('· ' + bucket.fullLabel);
        $('#detail-title').text(category.name);
        $('#detail-category-dot').css('background-color', safeColor(category.color));
        $('#detail-summary').text(summary + '.');
        $('#detail-total').text(money.format(total));

        $('#detail-body').html(items.map(entry => {
            const transaction = entry.transaction;
            if (Number(transaction.id) === state.editingTransactionId) {
                return renderDetailEditRow(transaction);
            }
            const notes = [];
            if (transaction.description) {
                notes.push(transaction.description);
            }
            const billId = String(transaction.billId || '').trim();
            if (billId) {
                notes.push('Bill ' + billId);
            }
            const note = notes.length
                ? '<div class="tx-sub" title="' + esc(notes.join(' · ')) + '">'
                    + esc(notes.join(' · ')) + '</div>'
                : '';
            return '<tr>'
                + '<td class="date-cell">' + esc(formatDate(transaction.bankDate)) + '</td>'
                + '<td><div class="tx-title" title="' + esc(transaction.title) + '">'
                    + esc(transaction.title) + '</div>' + note + '</td>'
                + '<td class="date-cell detail-real-date">' + esc(formatDate(transaction.realDate)) + '</td>'
                + '<td class="col-type"><span class="type-tag">'
                    + esc(transaction.paymentType || '—') + '</span></td>'
                + '<td class="align-right"><span class="amount negative">'
                    + esc(money.format(-entry.amount)) + '</span></td>'
                + '<td class="col-action"><button type="button" class="icon-btn detail-edit-btn"'
                    + ' data-id="' + Number(transaction.id) + '"'
                    + ' aria-label="Edit transaction ' + esc(transaction.title) + '" title="Edit transaction">'
                    + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"'
                    + ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"'
                    + ' stroke-linecap="round"/></svg></button></td>'
                + '</tr>';
        }).join(''));

        const wasHidden = $('#spending-detail').prop('hidden');
        $('#spending-detail').prop('hidden', false);
        if (wasHidden) {
            const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            $('#spending-detail')[0].scrollIntoView({
                behavior: reduceMotion ? 'auto' : 'smooth',
                block: 'start'
            });
        }
        $('#spending-announcer').text(
            'Showing ' + summary + ' in ' + category.name + ', total ' + money.format(total) + '.');
    }

    /* ----------------------------------------------------------------------
       Transactions view: filter, sort, select and edit
       ---------------------------------------------------------------------- */

    const TRANSACTION_SORTERS = {
        date: transaction => String(transaction.bankDate || ''),
        name: transaction => String(transaction.title || ''),
        description: transaction => String(transaction.description || ''),
        ref: transaction => String(transaction.billId || ''),
        category: transaction => getCategory(transaction.categoryId).name,
        amount: transaction => toNumber(transaction.amount)
    };

    function openTransactions() {
        if (hasPendingImport()
            && !window.confirm('Discard the current import and open transactions? Nothing has been saved yet.')) {
            return;
        }
        resetImportState();
        showView('transactions');
        renderTransactions();
    }

    async function afterTransactionChange() {
        await refreshTransactions();
        renderHome();
        renderSpending();
        renderTransactions();
    }

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
        const category = String($('#tx-filter-category').val() || '');
        const group = String($('#tx-filter-group').val() || '');
        return {
            category: category === '' ? null : Number(category),
            group: group === '' ? null : Number(group),
            min: numberOf('#tx-filter-min'),
            max: numberOf('#tx-filter-max'),
            name: textOf('#tx-filter-name'),
            description: textOf('#tx-filter-description')
        };
    }

    /** Amount limits apply to the absolute value, so spending and income are both covered. */
    function filterTransactions(list, filters) {
        return list.filter(transaction => {
            if (filters.category !== null && (Number(transaction.categoryId) || 0) !== filters.category) {
                return false;
            }
            if (filters.group !== null && spendingGroupId(transaction) !== filters.group) {
                return false;
            }
            const amount = Math.abs(toNumber(transaction.amount));
            if (filters.min !== null && amount < filters.min) {
                return false;
            }
            if (filters.max !== null && amount > filters.max) {
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

    function fillSelect($select, options) {
        const current = $select.val();
        $select.empty();
        options.forEach(option => {
            $('<option>', { value: option.value, text: option.label }).appendTo($select);
        });
        if (current !== null && current !== undefined) {
            keepSelection($select, current);
        }
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
            + '<td class="col-action"><button type="button" class="icon-btn tx-edit-btn" data-id="' + id + '"'
                + ' aria-label="Edit transaction ' + esc(transaction.title) + '" title="Edit transaction">'
                + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"'
                + ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"'
                + ' stroke-linecap="round"/></svg></button></td>'
            + '</tr>';
    }

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
            await afterTransactionChange();
        } catch (xhr) {
            toast(errorDetail(xhr), 'error');
        } finally {
            $button.removeAttr('aria-busy');
            updateTransactionSelectionUi();
        }
    }

    function renderDetailEditRow(transaction, columns) {
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

    async function saveTransactionEdit(form) {
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
            await afterTransactionChange();
        } catch (xhr) {
            toast(errorDetail(xhr), 'error');
            $form.find('button').prop('disabled', false);
        }
    }

    function closeSpendingDetail() {
        state.spendingSelection = null;
        state.editingTransactionId = null;
        $('#spending-detail').prop('hidden', true);
        $('#detail-body').empty();
        $('#spending-announcer').text('');
        applySpendingSelection();
    }

    /* ----------------------------------------------------------------------
       Administration: categories and category ids
       ---------------------------------------------------------------------- */

    function renderAdmin() {
        renderGroupOptions();
        renderIdCategoryOptions();
        renderAdminPlacement();
        renderAdminColor();
        renderAdminIdHint();
        renderDeleteOptions();
    }

    function adminGroups() {
        const groups = new Map();
        state.categories.forEach(category => {
            const groupId = Number(category.groupId) || 0;
            if (groupId === 0) {
                return;
            }
            const group = groups.get(groupId)
                || { id: groupId, name: category.groupName || category.name, root: '' };
            if (Number(category.subId) === 0) {
                group.root = category.name;
            }
            groups.set(groupId, group);
        });
        const list = Array.from(groups.values());
        list.forEach(group => {
            const shared = list.filter(other => other.name === group.name).length > 1;
            group.label = shared && group.root && group.root !== group.name
                ? group.name + ' · ' + group.root
                : group.name;
        });
        return list.sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
    }

    function renderGroupOptions() {
        const $select = $('#admin-add-group');
        const selected = $select.val();
        $select.empty();
        adminGroups().forEach(group => {
            $('<option>', { value: group.id, text: group.label }).appendTo($select);
        });
        keepSelection($select, selected);
    }

    function renderIdCategoryOptions() {
        const $select = $('#admin-id-category');
        const selected = $select.val();
        $select.empty();
        state.categories
            .filter(category => Number(category.id) !== CATEGORY_NONE.id)
            .slice()
            .sort((a, b) => Number(a.id) - Number(b.id))
            .forEach(category => {
                $('<option>', {
                    value: category.id,
                    text: category.name + ' (id ' + category.id + ')'
                }).appendTo($select);
            });
        keepSelection($select, selected);
    }

    function renderDeleteOptions() {
        const $category = $('#admin-delete-category');
        const $replacement = $('#admin-delete-replacement');
        const categorySelected = $category.val();
        const replacementSelected = $replacement.val();
        const sorted = state.categories.slice().sort((a, b) => Number(a.id) - Number(b.id));

        $category.empty();
        sorted
            .filter(category => Number(category.id) !== CATEGORY_NONE.id)
            .forEach(category => $category.append(categoryOption(category)));
        keepSelection($category, categorySelected);

        const deleting = String($category.val());
        $replacement.empty().append($('<option>', { value: '0', text: 'Uncategorized (id 0)' }));
        sorted
            .filter(category => Number(category.id) !== CATEGORY_NONE.id && String(category.id) !== deleting)
            .forEach(category => $replacement.append(categoryOption(category)));
        keepSelection($replacement, replacementSelected);
        renderDeleteHint();
    }

    function categoryOption(category) {
        return $('<option>', {
            value: category.id,
            text: category.name + ' (id ' + category.id + ')'
        });
    }

    function renderDeleteHint() {
        const $hint = $('#admin-delete-hint');
        const id = Number($('#admin-delete-category').val()) || 0;
        const replacement = Number($('#admin-delete-replacement').val()) || 0;
        const target = state.categoryById.get(replacement);
        if (!id || !target) {
            $hint.text('');
            return;
        }
        const count = transactionCount(id);
        $hint.text(count + (count === 1 ? ' transaction' : ' transactions')
            + ' will move to ' + target.name + ' (id ' + replacement + ').');
    }

    function keepSelection($select, value) {
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

    function renderAdminPlacement() {
        const existing = $('input[name="admin-add-placement"]:checked').val() === 'existing';
        $('#admin-add-group-field').prop('hidden', !existing);
    }

    function renderAdminColor() {
        $('#admin-add-color-hex').text(String($('#admin-add-color').val()).toUpperCase());
    }

    function renderAdminIdHint() {
        const $hint = $('#admin-id-hint').removeClass('is-warning');
        $('#admin-id-new').removeClass('is-invalid');
        const oldId = Number($('#admin-id-category').val()) || 0;
        const raw = String($('#admin-id-new').val() || '').trim();
        if (!oldId) {
            $hint.text('');
            return;
        }
        if (raw === '') {
            $hint.text('Current id: ' + oldId + '.');
            return;
        }
        const newId = Number(raw);
        const problem = adminIdProblem(oldId, newId);
        if (problem) {
            $hint.text(problem).addClass('is-warning');
            return;
        }
        const count = transactionCount(oldId);
        $hint.text(count + (count === 1 ? ' transaction' : ' transactions')
            + ' will move from id ' + oldId + ' to ' + newId + '.');
    }

    function adminIdProblem(oldId, newId) {
        if (!Number.isInteger(newId) || newId <= 0) {
            return 'Enter a whole number greater than 0.';
        }
        if (newId === oldId) {
            return 'This category already has id ' + oldId + '.';
        }
        const owner = state.categoryById.get(newId);
        if (owner) {
            return 'Id ' + newId + ' is already used by “' + owner.name + '”.';
        }
        if (state.transactions.some(transaction => Number(transaction.categoryId) === newId)) {
            return 'Id ' + newId + ' is already used by existing transactions.';
        }
        return '';
    }

    function transactionCount(categoryId) {
        return state.transactions.filter(transaction => Number(transaction.categoryId) === categoryId).length;
    }

    async function submitDeleteCategory(event) {
        event.preventDefault();
        const id = Number($('#admin-delete-category').val()) || 0;
        const replacement = Number($('#admin-delete-replacement').val()) || 0;
        const $submit = $('#admin-delete-submit');
        const category = state.categoryById.get(id);
        const target = state.categoryById.get(replacement);

        if (!category || !target) {
            toast('Choose a category to delete.', 'error');
            return;
        }
        const count = transactionCount(id);
        const message = 'Delete “' + category.name + '” (id ' + id + ')?\n\n'
            + count + (count === 1 ? ' transaction' : ' transactions')
            + ' and any default rules using it will move to “' + target.name + '” (id ' + replacement
            + '). A backup is saved first.';
        if (!window.confirm(message)) {
            return;
        }

        $submit.prop('disabled', true).attr('aria-busy', 'true');
        try {
            const result = await $.ajax({
                url: '/api/categories/' + encodeURIComponent(id) + '?replacementId=' + encodeURIComponent(replacement),
                method: 'DELETE',
                dataType: 'json'
            });
            toast('“' + category.name + '” deleted: ' + result.transactionsUpdated
                + (result.transactionsUpdated === 1 ? ' transaction' : ' transactions')
                + ' and ' + result.defaultCategoriesUpdated
                + (result.defaultCategoriesUpdated === 1 ? ' default rule' : ' default rules')
                + ' moved to ' + target.name + '.', 'success');
            await refreshLedger();
        } catch (xhr) {
            toast(errorDetail(xhr), 'error');
        } finally {
            $submit.prop('disabled', false).removeAttr('aria-busy');
        }
    }

    async function submitNewCategory(event) {
        event.preventDefault();
        const $name = $('#admin-add-name');
        const $submit = $('#admin-add-submit');
        const name = String($name.val() || '').trim().replace(/\s+/g, ' ');
        const existing = $('input[name="admin-add-placement"]:checked').val() === 'existing';

        if (!name) {
            $name.addClass('is-invalid').trigger('focus');
            toast('Give the category a name.', 'error');
            return;
        }
        const groupId = existing ? Number($('#admin-add-group').val()) || 0 : null;
        if (existing && !groupId) {
            toast('Choose the group to add the category to.', 'error');
            return;
        }

        $submit.prop('disabled', true).attr('aria-busy', 'true');
        try {
            const created = await $.ajax({
                url: '/api/categories',
                method: 'POST',
                contentType: 'application/json',
                dataType: 'json',
                data: JSON.stringify({
                    name: name,
                    color: String($('#admin-add-color').val()),
                    groupId: groupId
                })
            });
            $name.val('').removeClass('is-invalid');
            toast(existing
                ? '“' + created.name + '” added to the group “' + created.groupName + '”.'
                : 'New group “' + created.groupName + '” created.', 'success');
            await refreshLedger();
        } catch (xhr) {
            toast(errorDetail(xhr), 'error');
        } finally {
            $submit.prop('disabled', false).removeAttr('aria-busy');
        }
    }

    async function submitCategoryId(event) {
        event.preventDefault();
        const $category = $('#admin-id-category');
        const $newId = $('#admin-id-new');
        const $submit = $('#admin-id-submit');
        const oldId = Number($category.val()) || 0;
        const newId = Number(String($newId.val() || '').trim());
        const problem = oldId ? adminIdProblem(oldId, newId) : 'Choose a category first.';

        if (problem) {
            $newId.addClass('is-invalid').trigger('focus');
            toast(problem, 'error');
            return;
        }

        const name = state.categoryById.get(oldId).name;
        const count = transactionCount(oldId);
        const message = 'Change the id of “' + name + '” from ' + oldId + ' to ' + newId + '?\n\n'
            + count + (count === 1 ? ' transaction' : ' transactions')
            + ' and any default rules using it will move to the new id. A backup is saved first.';
        if (!window.confirm(message)) {
            return;
        }

        $submit.prop('disabled', true).attr('aria-busy', 'true');
        try {
            const change = await $.ajax({
                url: '/api/categories/' + encodeURIComponent(oldId) + '/id',
                method: 'PATCH',
                contentType: 'application/json',
                dataType: 'json',
                data: JSON.stringify({ newId: newId })
            });
            $newId.val('');
            toast('Id changed from ' + change.oldId + ' to ' + change.newId + ': '
                + change.transactionsUpdated + (change.transactionsUpdated === 1 ? ' transaction' : ' transactions')
                + ' and ' + change.defaultCategoriesUpdated
                + (change.defaultCategoriesUpdated === 1 ? ' default rule' : ' default rules') + ' updated.', 'success');
            await refreshLedger();
        } catch (xhr) {
            toast(errorDetail(xhr), 'error');
        } finally {
            $submit.prop('disabled', false).removeAttr('aria-busy');
        }
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

    function categoryOptions(selectedId) {
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

    function paintCategorySelect(select) {
        const category = getCategory(select.value);
        const palette = categoryPalette(category.color);
        select.style.backgroundColor = palette.background;
        select.style.color = palette.foreground;
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

    function normalizeRuleText(value) {
        return String(value || '').trim().replace(/\s+/g, ' ');
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

    /**
     * A saved row is a duplicate when the amount (in cents), the bank date and
     * the title all match. Amounts are compared as integers so that floating
     * point noise cannot hide a duplicate. Titles are trimmed and internal
     * whitespace is collapsed because the OFX parser normalizes names that way,
     * while older ledger files may still contain repeated spaces.
     */
    function importRowKey(amount, bankDate, title) {
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
        resetSpendingState();
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
    }

    /* ----------------------------------------------------------------------
       View helpers
       ---------------------------------------------------------------------- */

    function showView(name) {
        const navView = name === 'import' ? 'home' : name;
        const navButtons = {
            home: '#nav-home',
            spending: '#nav-spending',
            transactions: '#nav-transactions',
            admin: '#nav-admin'
        };
        state.editingTransactionId = null;
        $('#home-view').prop('hidden', name !== 'home');
        $('#spending-view').prop('hidden', name !== 'spending');
        $('#transactions-view').prop('hidden', name !== 'transactions');
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

    function resetSpendingState() {
        state.spendingMonth = null;
        state.spendingYear = null;
        state.spendingData = null;
        closeSpendingDetail();
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

    function parseIsoDate(value) {
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

    function isoDay(date) {
        return date.getFullYear() + '-'
            + String(date.getMonth() + 1).padStart(2, '0') + '-'
            + String(date.getDate()).padStart(2, '0');
    }

    function formatLongDate(date) {
        return longDate.format(date);
    }

    function compactMoney(value) {
        if (!Number.isFinite(value) || value === 0) {
            return '€0';
        }
        return '€' + d3.format('.2~s')(value);
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

    /**
     * Category chips and dropdown lines use the category colour as their
     * background. The colour is used exactly when white or the app ink is
     * readable on it. For the few mid-tone colours where neither reaches
     * 4.5:1, the background is nudged towards black or white until the text
     * passes, keeping the hue recognisable.
     */
    function categoryPalette(color) {
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
