/* ==========================================================================
   CochonBank2 - shared application state and selectors
   Views read and mutate the single state object. The API actions at the
   bottom are the only place in the frontend that load server data.
   ========================================================================== */

export const CATEGORY_NONE = Object.freeze({
    id: 0,
    name: 'Uncategorized',
    color: '#C7C0B2'
});
export const FALLBACK_COLOR = '#A8A29E';

export const state = {
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
    spendingEarningsHidden: false,
    chartGrouped: true,
    chartCurrentYear: true,
    editingTransactionId: null,
    transactionSort: { key: 'date', direction: 'desc' },
    transactionSelection: new Set(),
    transactionVisible: [],
    transactionFilterTimer: null,
    filtersRestored: { spending: false, transactions: false },
    reccuringCosts: [],
    editingReccuring: null,
    spendingData: null,
    spendingResizeTimer: null
};

/* --------------------------------------------------------------------------
   Derived selectors
   -------------------------------------------------------------------------- */

export function categoryKey(categoryId, grouped) {
    const id = Number(categoryId) || 0;
    if (!grouped || id === 0) {
        return id;
    }
    return categoryGroupId(id);
}

/** The group a category belongs to, or 0 when it has no group. */
export function categoryGroupId(categoryId) {
    const id = Number(categoryId) || 0;
    if (id === 0) {
        return 0;
    }
    const category = state.categoryById.get(id);
    return category ? (Number(category.groupId) || 0) : 0;
}

export function groupCategory(groupId) {
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

export function adminGroups() {
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

export function getCategory(categoryId) {
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

/* --------------------------------------------------------------------------
   API actions
   -------------------------------------------------------------------------- */

function setCategories(list) {
    state.categories = Array.isArray(list) ? list : [];
    state.categoryById = new Map(state.categories.map(category => [Number(category.id), category]));
    state.categoryById.set(CATEGORY_NONE.id, CATEGORY_NONE);
}

export async function refreshTransactions() {
    state.transactions = await $.getJSON('/api/transactions');
}

export async function loadLedger() {
    const results = await Promise.all([
        $.getJSON('/api/categories'),
        $.getJSON('/api/transactions'),
        $.getJSON('/api/reccuring-costs')
    ]);
    setCategories(results[0]);
    state.transactions = Array.isArray(results[1]) ? results[1] : [];
    state.reccuringCosts = Array.isArray(results[2]) ? results[2] : [];
}

export async function refreshReccuring() {
    const costs = await $.getJSON('/api/reccuring-costs');
    state.reccuringCosts = Array.isArray(costs) ? costs : [];
}

