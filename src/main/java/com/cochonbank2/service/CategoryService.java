package com.cochonbank2.service;

import java.io.IOException;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.cochonbank2.config.DataBackupService;
import com.cochonbank2.csv.CsvException;
import com.cochonbank2.domain.Category;
import com.cochonbank2.repository.CategoryRepository;
import com.cochonbank2.repository.DefaultCategoryRepository;
import com.cochonbank2.repository.PlannedSpendingRepository;
import com.cochonbank2.repository.ReccuringCostsRepository;
import com.cochonbank2.repository.TransactionRepository;

@Service
public class CategoryService {

    static final String DEFAULT_COLOR = "#78909C";

    private static final long UNCATEGORIZED_ID = 0L;
    private static final long SUB_STEP = 10L;
    private static final long MAX_SUB_ID = 99L;
    private static final Pattern HEX_COLOR = Pattern.compile("#[0-9A-Fa-f]{6}");

    private final CategoryRepository repository;
    private final TransactionRepository transactionRepository;
    private final DefaultCategoryRepository defaultCategoryRepository;
    private final ReccuringCostsRepository reccuringCostsRepository;
    private final PlannedSpendingRepository plannedSpendingRepository;
    private final TransactionService transactionService;
    private final DefaultCategoryService defaultCategoryService;
    private final DataBackupService backupService;

    public CategoryService(
            CategoryRepository repository,
            TransactionRepository transactionRepository,
            DefaultCategoryRepository defaultCategoryRepository,
            ReccuringCostsRepository reccuringCostsRepository,
            PlannedSpendingRepository plannedSpendingRepository,
            TransactionService transactionService,
            DefaultCategoryService defaultCategoryService,
            DataBackupService backupService) {
        this.repository = repository;
        this.transactionRepository = transactionRepository;
        this.defaultCategoryRepository = defaultCategoryRepository;
        this.reccuringCostsRepository = reccuringCostsRepository;
        this.plannedSpendingRepository = plannedSpendingRepository;
        this.transactionService = transactionService;
        this.defaultCategoryService = defaultCategoryService;
        this.backupService = backupService;
    }

    public List<Category> findAll() {
        return repository.findAll().stream()
                .sorted(Comparator.comparing(Category::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public Map<Long, Category> findById() {
        return findAll().stream().collect(Collectors.toMap(Category::id, Function.identity(), (a, b) -> a));
    }

    /**
     * Adds a category. A {@code null} group creates a new group whose root is the
     * new category; otherwise the category is appended to the existing group.
     */
    public synchronized Category create(String name, String color, Long groupId) {
        String label = normalizeName(name);
        String hex = normalizeColor(color);
        List<Category> all = repository.findAll();
        if (all.stream().anyMatch(category -> category.name().equalsIgnoreCase(label))) {
            throw new IllegalArgumentException("A category named \"" + label + "\" already exists.");
        }

        Category created = groupId == null
                ? newGroup(all, label, hex)
                : newMember(all, groupId, label, hex);
        requireFreeId(all, created.id());
        repository.appendAll(List.of(created));
        return created;
    }

    /**
     * Gives a category a new identifier. Transactions and default category rules
     * that pointed to the old identifier are moved to the new one. The data
     * directory is backed up before anything is written.
     */
    public IdChange changeId(long oldId, long newId) {
        synchronized (transactionService) {
            synchronized (defaultCategoryService) {
                return rewriteId(oldId, newId);
            }
        }
    }

    private IdChange rewriteId(long oldId, long newId) {
        List<Category> all = repository.findAll();
        if (all.stream().noneMatch(category -> category.id() == oldId)) {
            throw new IllegalArgumentException("Unknown category (id " + oldId + ").");
        }
        if (oldId == UNCATEGORIZED_ID) {
            throw new IllegalArgumentException("The uncategorized id cannot be changed.");
        }
        if (newId <= 0) {
            throw new IllegalArgumentException("The new id must be a positive number.");
        }
        if (newId == oldId) {
            throw new IllegalArgumentException("The category already has id " + oldId + ".");
        }
        requireFreeId(all, newId);

        long references = transactionRepository.findAll().stream()
                .filter(transaction -> transaction.categoryId() == newId)
                .count()
                + defaultCategoryRepository.findAll().stream()
                        .filter(rule -> rule.categoryId() == newId)
                        .count()
                + reccuringCostsRepository.findAll().stream()
                        .filter(cost -> cost.categoryId() == newId)
                        .count()
                + plannedSpendingRepository.findAll().stream()
                        .filter(spending -> spending.categoryId() != null
                                && spending.categoryId() == newId)
                        .count();
        if (references > 0) {
            throw new IllegalArgumentException("Id " + newId + " is already used by "
                    + references + (references == 1 ? " record" : " records") + ". Choose another id.");
        }

        backup();
        int transactions = transactionRepository.replaceLongValue("Category_Id", oldId, newId);
        int rules = defaultCategoryRepository.replaceLongValue("Category_Id", oldId, newId);
        reccuringCostsRepository.replaceLongValue("Category_Id", oldId, newId);
        plannedSpendingRepository.replaceLongValue("Category_Id", oldId, newId);
        repository.replaceLongValue("Id", oldId, newId);
        return new IdChange(oldId, newId, transactions, rules);
    }

    /**
     * Deletes a category. Transactions and default category rules that used it
     * are moved to {@code replacementId}, where 0 means uncategorized. A snapshot
     * of the data directory is taken before anything is written.
     */
    public Deletion delete(long id, long replacementId) {
        synchronized (transactionService) {
            synchronized (defaultCategoryService) {
                return removeCategory(id, replacementId);
            }
        }
    }

    private Deletion removeCategory(long id, long replacementId) {
        List<Category> all = repository.findAll();
        if (all.stream().noneMatch(category -> category.id() == id)) {
            throw new IllegalArgumentException("Unknown category (id " + id + ").");
        }
        if (id == UNCATEGORIZED_ID) {
            throw new IllegalArgumentException("The uncategorized category cannot be deleted.");
        }
        if (replacementId == id) {
            throw new IllegalArgumentException("Choose a different category to replace it with.");
        }
        if (replacementId != UNCATEGORIZED_ID
                && all.stream().noneMatch(category -> category.id() == replacementId)) {
            throw new IllegalArgumentException("Unknown replacement category (id " + replacementId + ").");
        }

        backup();
        int transactions = transactionRepository.replaceLongValue("Category_Id", id, replacementId);
        int rules = defaultCategoryRepository.replaceLongValue("Category_Id", id, replacementId);
        reccuringCostsRepository.replaceLongValue("Category_Id", id, replacementId);
        plannedSpendingRepository.replaceLongValue("Category_Id", id, replacementId);
        repository.deleteLongValue("Id", id);
        return new Deletion(id, replacementId, transactions, rules);
    }

    private static Category newGroup(List<Category> all, String label, String color) {
        long groupId = all.stream().mapToLong(Category::groupId).max().orElse(0L) + 1;
        return new Category(groupId * 100, groupId, 0, label, label, color);
    }

    private static Category newMember(List<Category> all, long groupId, String label, String color) {
        List<Category> members = all.stream()
                .filter(category -> category.groupId() == groupId)
                .toList();
        if (groupId <= 0 || members.isEmpty()) {
            throw new IllegalArgumentException("Unknown group (id " + groupId + ").");
        }
        Category root = members.stream()
                .filter(category -> category.subId() == 0)
                .findFirst()
                .orElse(members.get(0));
        long subId = members.stream().mapToLong(Category::subId).max().orElse(0L) + SUB_STEP;
        if (subId > MAX_SUB_ID) {
            throw new IllegalArgumentException("Group \"" + root.groupName() + "\" has no free position left.");
        }
        return new Category(groupId * 100 + subId, groupId, subId, root.groupName(), label, color);
    }

    private static void requireFreeId(List<Category> all, long id) {
        if (all.stream().anyMatch(category -> category.id() == id)) {
            throw new IllegalArgumentException("Id " + id + " is already used by another category.");
        }
    }

    private void backup() {
        try {
            backupService.backupBeforeChange();
        } catch (IOException ex) {
            throw new CsvException("Cannot back up the data directory before changing the category id.", ex);
        }
    }

    private static String normalizeName(String value) {
        String name = value == null ? "" : value.trim().replaceAll("\\s+", " ");
        if (name.isEmpty()) {
            throw new IllegalArgumentException("A category name is required.");
        }
        return name;
    }

    private static String normalizeColor(String value) {
        String color = value == null || value.isBlank() ? DEFAULT_COLOR : value.trim();
        if (!HEX_COLOR.matcher(color).matches()) {
            throw new IllegalArgumentException("The color must be a hex value such as #1A2B3C.");
        }
        return color.toUpperCase(Locale.ROOT);
    }

    /**
     * Result of an id change: how many records were moved to the new id.
     */
    public record IdChange(long oldId, long newId, int transactionsUpdated, int defaultCategoriesUpdated) {
    }

    /**
     * Result of a deletion: the records moved to the replacement category.
     */
    public record Deletion(long id, long replacementId, int transactionsUpdated, int defaultCategoriesUpdated) {
    }
}
