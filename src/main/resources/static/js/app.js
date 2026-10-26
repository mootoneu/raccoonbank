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

        $('#detail-close').on('click', closeSpendingDetail);

        $(document).on('keydown', function (event) {
            if (event.key === 'Escape' && !$('#spending-detail').prop('hidden')) {
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
        if (!$('#spending-view').prop('hidden')) {
            resetSpendingState();
            renderSpending();
        }
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
        const bounds = spendingBounds(source);
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
            const years = source.map(entry => entry.date.getFullYear());
            const firstYear = years.length ? Math.min(...years) : new Date().getFullYear();
            const lastYear = years.length ? Math.max(...years) : firstYear;
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
        const rangeSource = source.filter(entry => entry.date >= start && entry.date < end);
        const categoryTotals = new Map();

        rangeSource.forEach(entry => {
            const key = range === 'month'
                ? isoDay(entry.date)
                : (range === 'year' ? monthKey(entry.date) : String(entry.date.getFullYear()));
            const bucket = bucketByKey.get(key);
            if (!bucket) {
                return;
            }
            const categoryId = Number(entry.transaction.categoryId) || 0;
            bucket.transactions.push(entry);
            bucket.total += entry.amount;
            bucket.values.set(categoryId, (bucket.values.get(categoryId) || 0) + entry.amount);
            bucket.counts.set(categoryId, (bucket.counts.get(categoryId) || 0) + 1);
            categoryTotals.set(categoryId, (categoryTotals.get(categoryId) || 0) + entry.amount);
        });

        const categories = Array.from(categoryTotals, entry => ({
            id: entry[0],
            category: getCategory(entry[0]),
            total: entry[1]
        }))
            .filter(entry => entry.total > 0)
            .sort((a, b) => b.total - a.total
                || a.category.name.localeCompare(b.category.name));

        return {
            range: range,
            buckets: buckets,
            bucketByKey: bucketByKey,
            categories: categories,
            rangeSource: rangeSource,
            total: d3.sum(rangeSource, entry => entry.amount),
            count: rangeSource.length,
            start: start,
            end: end,
            periodLabel: periodLabel,
            rangeTag: rangeTag,
            unit: unit,
            bounds: bounds
        };
    }

    function spendingBucket(key, label, fullLabel) {
        return {
            key: key,
            label: label,
            fullLabel: fullLabel,
            transactions: [],
            values: new Map(),
            counts: new Map(),
            total: 0
        };
    }

    function renderSpending() {
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
        const top = model.categories[0];

        $('#spending-total').text(money.format(model.total));
        $('#spending-total-sub').text(model.rangeTag);
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
            $('#spending-top-sub').text('No category to rank');
        }
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
        const description = barText[model.range] + ', stacked by category';
        $('#histogram-sub').text(description + '.');
        $('#spending-subtitle').text(
            barText[model.range] + '. Click a colored segment to see the transactions behind it.');
        $('#histogram-range-tag').text(model.rangeTag);
    }

    function renderSpendingLegend(model) {
        const $legend = $('#histogram-legend').empty();
        if (!model.rangeSource.length || !model.categories.length) {
            $legend.prop('hidden', true);
            return;
        }

        $legend.prop('hidden', false);
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

        const empty = !model.rangeSource.length;
        $('#histogram-empty').prop('hidden', !empty);
        $('#histogram-scroll').prop('hidden', empty);

        if (empty) {
            const hasSpending = spendingSource().length > 0;
            $('#histogram-empty-title').text(hasSpending ? 'Nothing spent in this period' : 'No spending yet');
            $('#histogram-empty-text').text(hasSpending
                ? 'Try another period or switch how the bars are grouped.'
                : 'Import an OFX statement to see where your money goes.');
            $('#histogram-import-btn').prop('hidden', hasSpending);
            svg.attr('aria-label', 'No spending in this period');
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

        const maxTotal = d3.max(model.buckets, bucket => bucket.total) || 1;
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

        const tooltip = d3.select('#histogram-tooltip');

        segments
            .on('mouseenter', function (event, segment) {
                segments.attr('opacity', other => (other === segment ? 1 : 0.3));
                d3.select(this).attr('stroke', '#152621').attr('stroke-width', 1.4);
                const count = segment.bucket.counts.get(segment.category.id) || 0;
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
                selectSpendingSegment(segment.category.id, segment.bucket.key);
            })
            .on('keydown', function (event, segment) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectSpendingSegment(segment.category.id, segment.bucket.key);
                }
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
            && selection.categoryId === segment.category.id
            && selection.bucketKey === segment.bucket.key);
    }

    function applySpendingSelection() {
        d3.selectAll('#spending-histogram .hist-segment')
            .classed('is-selected', segment => isSpendingSelected(segment));
    }

    function selectSpendingSegment(categoryId, bucketKey) {
        state.spendingSelection = {
            categoryId: Number(categoryId) || 0,
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
                .filter(entry => (Number(entry.transaction.categoryId) || 0) === selection.categoryId)
                .sort((a, b) => b.date - a.date
                    || (Number(b.transaction.id) || 0) - (Number(a.transaction.id) || 0))
            : [];

        if (!items.length) {
            closeSpendingDetail();
            return;
        }

        const category = getCategory(selection.categoryId);
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
            const notes = [];
            if (transaction.description) {
                notes.push(transaction.description);
            }
            if (Number(transaction.billId)) {
                notes.push('Bill #' + transaction.billId);
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

    function closeSpendingDetail() {
        state.spendingSelection = null;
        $('#spending-detail').prop('hidden', true);
        $('#detail-body').empty();
        $('#spending-announcer').text('');
        applySpendingSelection();
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
        const isSpending = name === 'spending';
        $('#home-view').prop('hidden', name !== 'home');
        $('#spending-view').prop('hidden', !isSpending);
        $('#import-view').prop('hidden', name !== 'import');
        $('#nav-home').toggleClass('is-active', !isSpending);
        $('#nav-spending').toggleClass('is-active', isSpending);
        if (isSpending) {
            $('#nav-spending').attr('aria-current', 'page');
            $('#nav-home').removeAttr('aria-current');
        } else {
            $('#nav-home').attr('aria-current', 'page');
            $('#nav-spending').removeAttr('aria-current');
        }
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
