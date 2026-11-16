/* ==========================================================================
   CochonBank2 - Spending view
   The stacked histogram, its category/group filter, period navigation and the
   transaction detail panel.
   ========================================================================== */

import { state, getCategory, categoryKey, groupCategory } from './state.js';
import {
    EARNED_COLOR, OVERSPEND_COLOR, STORAGE_KEYS, categoryPalette, compactMoney,
    esc, formatDate, formatLongDate, isoDay, isReccuringCost, isReccuringGain, money, monthKey,
    normalizeReccuringTitle, parseIsoDate, readStoredState, reccuringSpent,
    renderDetailEditRow, safeColor, saveTransactionEdit, signedMoney, storeState,
    toNumber
} from './utils.js';

/* --------------------------------------------------------------------------
   Source data and bounds
   -------------------------------------------------------------------------- */

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

function spendingCategoryKey(categoryId) {
    return categoryKey(categoryId, state.spendingGrouped);
}

function spendingEntryKey(transaction) {
    return spendingCategoryKey(transaction.categoryId);
}

function spendingDisplayCategory(key) {
    return state.spendingGrouped ? groupCategory(key) : getCategory(key);
}

function spendingBucketLabel() {
    return state.spendingGrouped ? 'group' : 'category';
}

/* --------------------------------------------------------------------------
   Category filter
   -------------------------------------------------------------------------- */

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

/* --------------------------------------------------------------------------
   Period model
   -------------------------------------------------------------------------- */

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

    // Expected recurring costs only make sense in the day-by-day monthly view.
    const recurringTotals = new Map();
    let recurringTotal = 0;
    if (range === 'month') {
        const daysInMonth = buckets.length;
        // A recurring cost already paid this month is shown by its transaction instead.
        const paidTitles = new Set(
            source.filter(entry => entry.date >= start && entry.date < end)
                .map(entry => normalizeReccuringTitle(entry.transaction.title).toLowerCase()));
        state.reccuringCosts.forEach(cost => {
            const rawAmount = toNumber(cost.amount);
            // Spending is measured from outgoing (negative) amounts, like transactions.
            if (!(rawAmount < 0)) {
                return;
            }
            if (paidTitles.has(normalizeReccuringTitle(cost.title).toLowerCase())) {
                return;
            }
            const amount = Math.abs(rawAmount);
            const entryKey = spendingCategoryKey(cost.categoryId);
            if (state.spendingCategories.size > 0
                    && !state.spendingCategories.has(entryKey)) {
                return;
            }
            const dayNumber = Math.trunc(Number(cost.day));
            if (!Number.isFinite(dayNumber) || dayNumber < 1) {
                return;
            }
            // A cost on the 31st falls on the last day of shorter months.
            const bucket = buckets[Math.min(dayNumber, daysInMonth) - 1];
            if (!bucket) {
                return;
            }
            bucket.recurring += amount;
            bucket.recurringValues.set(entryKey,
                (bucket.recurringValues.get(entryKey) || 0) + amount);
            bucket.recurringCosts.push({ key: entryKey, amount: amount, cost: cost });
            recurringTotals.set(entryKey, (recurringTotals.get(entryKey) || 0) + amount);
            recurringTotal += amount;
        });
    }

    const categories = Array.from(categoryTotals, entry => ({
        id: entry[0],
        category: spendingDisplayCategory(entry[0]),
        total: entry[1]
    }))
        .filter(entry => entry.total > 0)
        .sort((a, b) => a.id - b.id);

    const recurringCategories = Array.from(recurringTotals, entry => ({
        key: entry[0],
        category: spendingDisplayCategory(entry[0]),
        total: entry[1]
    })).sort((a, b) => a.key - b.key);

    return {
        range: range,
        buckets: buckets,
        bucketByKey: bucketByKey,
        categories: categories,
        recurringCategories: recurringCategories,
        recurringTotal: recurringTotal,
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
        earned: 0,
        recurring: 0,
        recurringValues: new Map(),
        recurringCosts: []
    };
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */

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
    saveSpendingFilters();
}

function renderSpendingStats(model) {
    const average = model.buckets.length ? model.total / model.buckets.length : 0;
    const recurringCostEntries = state.reccuringCosts.filter(isReccuringCost);
    const recurringExpected = d3.sum(recurringCostEntries, cost => toNumber(cost.amount));
    const recurringSpent = d3.sum(recurringCostEntries, cost => reccuringSpent(cost.title));
    const remainingRecurring = recurringExpected - recurringSpent;
    const totalGains =  d3.sum(state.reccuringCosts.filter(isReccuringGain), cost => toNumber(cost.amount));
    const toSpend =  totalGains - model.total + remainingRecurring;
    const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    $('#spending-total').text(money.format(model.total));
    $('#spending-total-sub').text(model.rangeTag);
    $('#spending-earned').text(money.format(model.earned));
    $('#spending-earned-sub').text('Net ' + signedMoney(model.earned - model.total));
    $('#spending-count').text(model.count);
    $('#spending-count-sub').text(
        model.count
            ? money.format(average) + ' avg / ' + model.unit
            : 'No spending in this period');

    $('#spending-recurring').text(money.format(Math.abs(remainingRecurring)));
    $('#spending-recurring-sub').text('remaining of '+money.format(Math.abs(recurringExpected)));
    $('#spending-to-spend')
        .text(money.format(toSpend || 0)) 
        .toggleClass('negative', toSpend < 0);
    $('#spending-to-spend-sub').text('Expected gain of '+money.format(totalGains));
}

function renderPeriodControls(model) {
    $('#spending-range .segment-btn').each(function () {
        const active = this.getAttribute('data-range') === model.range;
        $(this).toggleClass('is-active', active).attr('aria-pressed', String(active));
    });

    const earningsVisible = !state.spendingEarningsHidden;
    $('#spending-earnings-toggle')
        .attr('aria-pressed', String(earningsVisible))
        .attr('title', earningsVisible ? 'Hide the earnings line' : 'Show the earnings line');

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
    const earningsNote = state.spendingEarningsHidden
        ? ''
        : ' The line traces earnings for the same period.';
    const recurringNote = model.range === 'month' && model.recurringTotal > 0
        ? ' Hashed bars are expected recurring costs.'
        : '';
    $('#histogram-sub').text(description + '.' + earningsNote + recurringNote);
    $('#spending-subtitle').text(
        barText[model.range] + '. Click a '
        + (model.range === 'month' && model.recurringTotal > 0 ? 'solid' : 'colored')
        + ' segment to see the transactions behind it.');
    $('#histogram-range-tag').text(model.rangeTag);
}

function renderSpendingLegend(model) {
    const $legend = $('#histogram-legend').empty();
    if (!model.rangeSource.length && !model.earned && !model.recurringTotal) {
        $legend.prop('hidden', true);
        return;
    }

    $legend.prop('hidden', false);
    const over = overspentBuckets(model).length;
    if (!state.spendingEarningsHidden) {
        $('<div>', {
            class: 'hist-legend-item',
            title: 'Earnings · ' + money.format(model.earned)
        }).append(
            $('<span>', { class: 'legend-dot' }).css('background-color', EARNED_COLOR),
            $('<span>', { class: 'hist-legend-name', text: 'Earned (line)' }),
            $('<span>', { class: 'hist-legend-value', text: money.format(model.earned) })
        ).appendTo($legend);
    }
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

    if (model.recurringTotal > 0) {
        $('<div>', {
            class: 'hist-legend-item',
            title: 'Expected recurring costs in this period'
        }).append(
            $('<span>', { class: 'legend-dot legend-dot-hatched' }),
            $('<span>', { class: 'hist-legend-name', text: 'Recurring (expected)' }),
            $('<span>', { class: 'hist-legend-value', text: money.format(model.recurringTotal) })
        ).appendTo($legend);
    }

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

    const empty = !model.rangeSource.length && !model.recurringTotal
        && (state.spendingEarningsHidden || !model.earned);
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
    const todayKey = model.range === 'month' ? isoDay(new Date()) : null;
    const showToday = todayKey !== null && model.bucketByKey.has(todayKey);
    const margin = { top: showToday ? 26 : 14, right: 16, bottom: 38, left: 58 };
    const minBand = model.range === 'month' ? 20 : (model.range === 'year' ? 32 : 56);
    const plotWidth = Math.max(
        available - margin.left - margin.right,
        model.buckets.length * minBand);
    const width = Math.round(plotWidth + margin.left + margin.right);
    const height = 684;
    const innerHeight = height - margin.top - margin.bottom;

    svg
        .attr('viewBox', '0 0 ' + width + ' ' + height)
        .attr('width', width)
        .attr('height', height)
        .attr('aria-label', 'Spending histogram for ' + model.periodLabel
            + ', total ' + money.format(model.total)
            + (model.recurringTotal > 0
                ? ', plus ' + money.format(model.recurringTotal) + ' expected recurring costs'
                : ''));

    const root = svg.append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    const x = d3.scaleBand()
        .domain(model.buckets.map(bucket => bucket.key))
        .range([0, plotWidth])
        .paddingInner(model.buckets.length === 1 ? 0.55 : 0.26)
        .paddingOuter(0.08);

    const maxTotal = d3.max(model.buckets,
        bucket => Math.max(bucket.total + bucket.recurring,
            state.spendingEarningsHidden ? 0 : bucket.earned)) || 1;
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

    const keys = model.categories.map(entry => 'c' + entry.id)
        .concat(model.recurringCategories.map(entry => 'r' + entry.key));
    const rows = model.buckets.map(bucket => {
        const row = { bucket: bucket };
        model.categories.forEach(entry => {
            row['c' + entry.id] = bucket.values.get(entry.id) || 0;
        });
        model.recurringCategories.forEach(entry => {
            row['r' + entry.key] = bucket.recurringValues.get(entry.key) || 0;
        });
        return row;
    });

    if (model.recurringCategories.length) {
        const defs = svg.append('defs');
        model.recurringCategories.forEach(entry => {
            const pattern = defs.append('pattern')
                .attr('id', recurringHatchId(entry.key))
                .attr('width', 7)
                .attr('height', 7)
                .attr('patternUnits', 'userSpaceOnUse')
                .attr('patternTransform', 'rotate(45)');
            pattern.append('rect')
                .attr('width', 7)
                .attr('height', 7)
                .attr('fill', safeColor(entry.category.color));
            pattern.append('line')
                .attr('x1', 0)
                .attr('y1', 0)
                .attr('x2', 0)
                .attr('y2', 7)
                .attr('stroke', '#FFFFFF')
                .attr('stroke-width', 2.4)
                .attr('opacity', 0.72);
        });
    }

    const stack = d3.stack().keys(keys)(rows);
    const layers = root.append('g')
        .attr('class', 'histogram-bars')
        .selectAll('g')
        .data(stack)
        .join('g')
        .attr('fill', series => {
            const entry = spendingSeriesEntry(series.key, model);
            return entry.recurring
                ? 'url(#' + recurringHatchId(entry.key) + ')'
                : safeColor(entry.category.color);
        });

    const segments = layers.selectAll('rect')
        .data(series => {
            const entry = spendingSeriesEntry(series.key, model);
            return series.map(segment => ({
                bucket: segment.data.bucket,
                key: entry.key,
                category: entry.category,
                recurring: entry.recurring,
                amount: segment[1] - segment[0],
                y0: segment[0],
                y1: segment[1]
            })).filter(segment => segment.amount > 0.004);
        })
        .join('rect')
        .attr('class', segment => 'hist-segment'
            + (segment.recurring ? ' hist-segment-recurring' : ''))
        .attr('x', segment => x(segment.bucket.key))
        .attr('width', Math.max(1, x.bandwidth()))
        .attr('y', segment => y(segment.y1))
        .attr('height', segment => Math.max(0.8, y(segment.y0) - y(segment.y1)))
        .attr('rx', Math.min(2.5, x.bandwidth() / 4))
        .attr('stroke', segment => (segment.recurring ? '#000000' : '#FFFFFF'))
        .attr('stroke-width', segment => (segment.recurring ? 2 : 0.8))
        .attr('tabindex', segment => (segment.recurring ? null : 0))
        .attr('role', segment => (segment.recurring ? 'img' : 'button'))
        .attr('aria-label', segment => segment.category.name + ', ' + segment.bucket.fullLabel
            + ', ' + money.format(segment.amount)
            + (segment.recurring ? ' expected recurring cost.' : '. Show transactions.'))
        .classed('is-selected', segment => !segment.recurring && isSpendingSelected(segment));

    drawOverspendMarkers(root, model, x, y);
    if (!state.spendingEarningsHidden) {
        drawEarningsLine(root, model, x, y);
    }
    if (showToday) {
        drawTodayMarker(root, todayKey, x, innerHeight);
    }

    const tooltip = d3.select('#histogram-tooltip');

    segments
        .on('mouseenter', function (event, segment) {
            segments.attr('opacity', other => (other === segment ? 1 : 0.3));
            d3.select(this).attr('stroke', '#152621');
            const count = segment.recurring
                ? segment.bucket.recurringCosts.filter(item => item.key === segment.key).length
                : (segment.bucket.counts.get(segment.key) || 0);
            tooltip
                .html('<span class="tt-category">' + esc(segment.category.name)
                    + (segment.recurring ? ' · recurring' : '') + '</span>'
                    + '<span class="tt-meta">' + esc(segment.bucket.fullLabel) + '</span>'
                    + '<span class="tt-value">' + esc(money.format(segment.amount))
                    + (segment.recurring
                        ? ' expected' + (count > 1 ? ' · ' + count + ' costs' : '')
                        : ' · ' + count + (count === 1 ? ' transaction' : ' transactions')) + '</span>')
                .style('opacity', 1);
        })
        .on('mousemove', function (event) {
            tooltip
                .style('left', Math.min(Math.max(event.clientX, 90), window.innerWidth - 90) + 'px')
                .style('top', Math.max(event.clientY, 70) + 'px');
        })
        .on('mouseleave', function (event, segment) {
            segments.attr('opacity', 1);
            d3.select(this).attr('stroke', segment.recurring ? '#000000' : '#FFFFFF');
            tooltip.style('opacity', 0);
        })
        .on('click', function (event, segment) {
            if (!segment.recurring) {
                selectSpendingSegment(segment.key, segment.bucket.key);
            }
        })
        .on('keydown', function (event, segment) {
            if (!segment.recurring && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                selectSpendingSegment(segment.key, segment.bucket.key);
            }
        });
}

function recurringHatchId(key) {
    return 'hist-hatch-' + key;
}

function spendingSeriesEntry(key, model) {
    if (key.charAt(0) === 'r') {
        const recurringKey = Number(key.slice(1));
        const entry = model.recurringCategories.find(item => item.key === recurringKey);
        return entry
            ? { key: entry.key, category: entry.category, recurring: true }
            : null;
    }
    const entry = model.categories.find(item => 'c' + item.id === key);
    return entry
        ? { key: entry.id, category: entry.category, recurring: false }
        : null;
}

function drawTodayMarker(root, todayKey, x, innerHeight) {
    const cx = x(todayKey) + x.bandwidth() / 2;
    const labelX = Math.min(Math.max(cx, 16), x.range()[1] - 16);
    const group = root.append('g')
        .attr('class', 'histogram-today')
        .attr('pointer-events', 'none');
    group.append('line')
        .attr('x1', cx)
        .attr('x2', cx)
        .attr('y1', -8)
        .attr('y2', innerHeight)
        .attr('stroke', '#5F6D68')
        .attr('stroke-width', 1.4)
        .attr('stroke-dasharray', '4 4')
        .attr('opacity', 0.7);
    group.append('text')
        .attr('x', labelX)
        .attr('y', -12)
        .attr('text-anchor', 'middle')
        .attr('fill', '#5F6D68')
        .style('font-size', '9.5px')
        .style('font-weight', '700')
        .text('Today');
}

function overspentBuckets(model) {
    return model.buckets.filter(bucket =>
        bucket.total + bucket.recurring > bucket.earned + 0.005);
}

function drawOverspendMarkers(root, model, x, y) {
    root.append('g')
        .attr('class', 'histogram-overspend')
        .selectAll('circle')
        .data(overspentBuckets(model))
        .join('circle')
        .attr('cx', bucket => x(bucket.key) + x.bandwidth() / 2)
        .attr('cy', bucket => y(bucket.total + bucket.recurring) - 7)
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
            const expected = bucket.recurring > 0
                ? ' · Recurring ' + esc(money.format(bucket.recurring))
                : '';
            tooltip
                .html('<span class="tt-category">Earned ' + esc(money.format(bucket.earned)) + '</span>'
                    + '<span class="tt-meta">' + esc(bucket.fullLabel) + '</span>'
                    + '<span class="tt-value">Spent ' + esc(money.format(bucket.total))
                    + expected + ' · Net ' + esc(signedMoney(net)) + '</span>')
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

/* --------------------------------------------------------------------------
   Detail panel
   -------------------------------------------------------------------------- */

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

    renderDetailPeriodButtons();
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

/**
 * The nearest period in the given direction where the selected category has
 * transactions, or null when there is none.
 */
function adjacentDetailBucket(step) {
    const model = state.spendingData;
    const selection = state.spendingSelection;
    if (!model || !selection) {
        return null;
    }
    const index = model.buckets.findIndex(bucket => bucket.key === selection.bucketKey);
    for (let i = index + step; i >= 0 && i < model.buckets.length; i += step) {
        if ((model.buckets[i].counts.get(selection.key) || 0) > 0) {
            return model.buckets[i];
        }
    }
    return null;
}

function renderDetailPeriodButtons() {
    $('#detail-prev').prop('disabled', !adjacentDetailBucket(-1));
    $('#detail-next').prop('disabled', !adjacentDetailBucket(1));
}

function moveDetailPeriod(step) {
    const target = adjacentDetailBucket(step);
    if (!target) {
        return;
    }
    state.spendingSelection = { key: state.spendingSelection.key, bucketKey: target.key };
    applySpendingSelection();
    renderSpendingDetail();
}

function closeSpendingDetail() {
    state.spendingSelection = null;
    state.editingTransactionId = null;
    $('#spending-detail').prop('hidden', true);
    $('#detail-body').empty();
    $('#spending-announcer').text('');
    applySpendingSelection();
}

/* --------------------------------------------------------------------------
   Saved filter state
   -------------------------------------------------------------------------- */

function resetSpendingState() {
    state.spendingMonth = null;
    state.spendingYear = null;
    state.spendingData = null;
    closeSpendingDetail();
}

function saveSpendingFilters() {
    if (!state.filtersRestored.spending) {
        return;
    }
    storeState(STORAGE_KEYS.spendingFilters, {
        range: state.spendingRange,
        month: state.spendingMonth,
        year: state.spendingYear,
        categories: Array.from(state.spendingCategories),
        grouped: state.spendingGrouped
    });
}

function restoreSpendingFilters() {
    state.filtersRestored.spending = true;
    const stored = readStoredState(STORAGE_KEYS.spendingFilters);
    if (!stored) {
        return;
    }
    if (stored.range === 'month' || stored.range === 'year' || stored.range === 'all') {
        state.spendingRange = stored.range;
    }
    if (typeof stored.month === 'string' && /^\d{4}-\d{2}$/.test(stored.month)) {
        state.spendingMonth = stored.month;
    }
    if (Number.isInteger(stored.year)) {
        state.spendingYear = stored.year;
    }
    if (Array.isArray(stored.categories)) {
        state.spendingCategories = new Set(stored.categories
            .map(id => Number(id))
            .filter(id => Number.isFinite(id)));
    }
    if (typeof stored.grouped === 'boolean') {
        state.spendingGrouped = stored.grouped;
        $('#spending-group-mode').prop('checked', state.spendingGrouped);
    }
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

let afterChange = async () => {};

export function initSpendingView(options) {
    afterChange = (options && options.afterChange) || afterChange;

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

    $('#spending-earnings-toggle').on('click', function () {
        state.spendingEarningsHidden = !state.spendingEarningsHidden;
        renderSpending();
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
    $('#detail-prev').on('click', () => moveDetailPeriod(-1));
    $('#detail-next').on('click', () => moveDetailPeriod(1));

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
            saveTransactionEdit(this, afterChange);
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
        if (!$('#spending-view').prop('hidden') && state.spendingData) {
            window.clearTimeout(state.spendingResizeTimer);
            state.spendingResizeTimer = window.setTimeout(function () {
                if (!$('#spending-view').prop('hidden') && state.spendingData) {
                    renderHistogram(state.spendingData);
                }
            }, 140);
        }
    });
}

export {
    renderSpending,
    ensureSpendingAnchors,
    restoreSpendingFilters,
    resetSpendingState
};
