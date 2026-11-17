package com.raccoonbank.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.raccoonbank.domain.Category;
import com.raccoonbank.domain.PlannedSpending;
import com.raccoonbank.repository.CategoryRepository;
import com.raccoonbank.repository.PlannedSpendingRepository;

/**
 * Keeps the planned spending list in due-date order. Rows are identified by
 * their position in that order; the position of a row in the CSV file is kept
 * separately so edits and deletions always target the right record.
 */
@Service
public class PlannedSpendingService {

    private static final Comparator<PlannedSpending> ORDER =
            Comparator.comparing(PlannedSpending::dueDate,
                            Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(PlannedSpending::title,
                            Comparator.nullsLast(String.CASE_INSENSITIVE_ORDER))
                    .thenComparing(PlannedSpending::amount,
                            Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(PlannedSpending::categoryId,
                            Comparator.nullsLast(Comparator.naturalOrder()));

    private final PlannedSpendingRepository repository;
    private final CategoryRepository categoryRepository;

    public PlannedSpendingService(
            PlannedSpendingRepository repository,
            CategoryRepository categoryRepository) {
        this.repository = repository;
        this.categoryRepository = categoryRepository;
    }

    /** A planned spending with its position in the displayed order and in the file. */
    public record Entry(int index, PlannedSpending spending, int rowIndex) {
    }

    public List<Entry> findAll() {
        return entries();
    }

    public synchronized Entry create(
            LocalDate dueDate, String title, BigDecimal amount, Long categoryId) {
        PlannedSpending created = validate(dueDate, title, amount, categoryId);
        int rowIndex = repository.findAll().size();
        repository.appendAll(List.of(created));
        return entryForRow(rowIndex);
    }

    public synchronized Entry update(
            int index, LocalDate dueDate, String title, BigDecimal amount, Long categoryId) {
        Entry current = entryAt(index);
        PlannedSpending updated = validate(dueDate, title, amount, categoryId);

        Map<String, String> values = new LinkedHashMap<>();
        values.put("DueDate", updated.dueDate() == null ? "" : updated.dueDate().toString());
        values.put("Title", updated.title());
        values.put("Amount", updated.amount().toPlainString());
        values.put("Category_Id", updated.categoryId() == null ? "" : Long.toString(updated.categoryId()));
        if (!repository.updateRowAt(current.rowIndex(), values)) {
            throw new IllegalArgumentException("Unknown planned spending (index " + index + ").");
        }
        return entryForRow(current.rowIndex());
    }

    public synchronized void delete(int index) {
        Entry current = entryAt(index);
        if (!repository.deleteRowAt(current.rowIndex())) {
            throw new IllegalArgumentException("Unknown planned spending (index " + index + ").");
        }
    }

    private Entry entryAt(int index) {
        List<Entry> all = entries();
        if (index < 0 || index >= all.size()) {
            throw new IllegalArgumentException("Unknown planned spending (index " + index + ").");
        }
        return all.get(index);
    }

    private Entry entryForRow(int rowIndex) {
        return entries().stream()
                .filter(entry -> entry.rowIndex() == rowIndex)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Unknown planned spending (row " + rowIndex + ")."));
    }

    private List<Entry> entries() {
        List<PlannedSpending> all = repository.findAll();
        List<Entry> sorted = new ArrayList<>(all.size());
        for (int i = 0; i < all.size(); i++) {
            sorted.add(new Entry(0, all.get(i), i));
        }
        sorted.sort((first, second) -> ORDER.compare(first.spending(), second.spending()));
        List<Entry> entries = new ArrayList<>(sorted.size());
        for (int i = 0; i < sorted.size(); i++) {
            Entry entry = sorted.get(i);
            entries.add(new Entry(i, entry.spending(), entry.rowIndex()));
        }
        return entries;
    }

    private PlannedSpending validate(
            LocalDate dueDate, String title, BigDecimal amount, Long categoryId) {
        String label = normalizeTitle(title);
        if (amount == null) {
            throw new IllegalArgumentException("An expected amount is required.");
        }
        return new PlannedSpending(dueDate, label, amount, requireCategory(categoryId));
    }

    private Long requireCategory(Long categoryId) {
        if (categoryId == null || categoryId <= 0) {
            return null;
        }
        boolean known = categoryRepository.findAll().stream()
                .map(Category::id)
                .anyMatch(candidate -> candidate.equals(categoryId));
        if (!known) {
            throw new IllegalArgumentException("Unknown category (id " + categoryId + ").");
        }
        return categoryId;
    }

    private static String normalizeTitle(String value) {
        String title = value == null ? "" : value.trim().replaceAll("\\s+", " ");
        if (title.isEmpty()) {
            throw new IllegalArgumentException("A title is required.");
        }
        return title;
    }
}
