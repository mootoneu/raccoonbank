/* ==========================================================================
   RaccoonBank - Administration view
   Category creation, category ids and category deletion.
   ========================================================================== */

import { state, CATEGORY_NONE, adminGroups } from './state.js';
import { errorDetail, keepSelection, toast } from './utils.js';

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */

function renderAdmin() {
    renderGroupOptions();
    renderIdCategoryOptions();
    renderAdminPlacement();
    renderAdminColor();
    renderAdminIdHint();
    renderDeleteOptions();
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

/* --------------------------------------------------------------------------
   Form actions
   -------------------------------------------------------------------------- */

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
        await onLedgerChanged();
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
        await onLedgerChanged();
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
        await onLedgerChanged();
    } catch (xhr) {
        toast(errorDetail(xhr), 'error');
    } finally {
        $submit.prop('disabled', false).removeAttr('aria-busy');
    }
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

let onLedgerChanged = async () => {};

export function initAdminView(options) {
    onLedgerChanged = (options && options.onLedgerChanged) || onLedgerChanged;

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
}

export { renderAdmin };
