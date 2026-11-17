/* ==========================================================================
   RaccoonBank - Overview view
   Dashboard totals, recent transactions, the donut chart and cash flow chart.
   ========================================================================== */

import { state, getCategory, categoryKey, groupCategory } from './state.js';
import {
    categoryChip, compactMoney, esc, formatDate, money, monthKey, parseIsoDate,
    safeColor, signedMoney, toNumber, truncate
} from './utils.js';

/* --------------------------------------------------------------------------
   Dashboard
   -------------------------------------------------------------------------- */

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

/* --------------------------------------------------------------------------
   Donut chart
   -------------------------------------------------------------------------- */

function renderChart() {
    const grouped = state.chartGrouped;
    const currentYear = new Date().getFullYear();
    const expenses = state.transactions.filter(transaction => {
        if (toNumber(transaction.amount) >= 0) {
            return false;
        }
        if (!state.chartCurrentYear) {
            return true;
        }
        const date = parseIsoDate(transaction.bankDate);
        return Boolean(date) && date.getFullYear() === currentYear;
    });
    const totals = d3.rollup(
        expenses,
        values => d3.sum(values, transaction => Math.abs(toNumber(transaction.amount))),
        transaction => categoryKey(Number(transaction.categoryId) || 0, grouped));

    const data = Array.from(totals, entry => ({
        category: grouped ? groupCategory(entry[0]) : getCategory(entry[0]),
        value: entry[1]
    }))
        .filter(entry => entry.value > 0)
        .sort((a, b) => b.value - a.value);

    const scope = state.chartCurrentYear ? 'Expenses in ' + currentYear : 'All saved expenses';
    $('#chart-sub').text(scope + ', grouped by ' + (grouped ? 'category group' : 'category') + '.');

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

/* --------------------------------------------------------------------------
   Cash flow chart
   -------------------------------------------------------------------------- */

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

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

export function initHomeView() {
    $('#cashflow-range').on('click', '.segment-btn', function () {
        const months = Number(this.getAttribute('data-months'));
        if (!months || months === state.cashflowMonths) {
            return;
        }
        state.cashflowMonths = months;
        renderCashflow();
    });

    $('#chart-group-mode').on('change', function () {
        state.chartGrouped = this.checked;
        renderChart();
    });

    $('#chart-year-mode').on('change', function () {
        state.chartCurrentYear = this.checked;
        renderChart();
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
    });
}

export { renderHome, renderCashflow };
