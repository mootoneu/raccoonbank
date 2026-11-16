package com.cochonbank2.service;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.cochonbank2.domain.Category;
import com.cochonbank2.domain.ReccuringCosts;
import com.cochonbank2.repository.CategoryRepository;
import com.cochonbank2.repository.ReccuringCostsRepository;

@Service
public class ReccuringCostsService {

    private final ReccuringCostsRepository repository;
    private final CategoryRepository categoryRepository;

    public ReccuringCostsService(
            ReccuringCostsRepository repository,
            CategoryRepository categoryRepository) {
        this.repository = repository;
        this.categoryRepository = categoryRepository;
    }

    public List<ReccuringCosts> findAll() {
        return repository.findAll().stream()
                .sorted(Comparator
                        .comparingInt(ReccuringCosts::day)
                        .thenComparing(ReccuringCosts::title, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    /**
     * Adds an expected recurring cost. Titles are unique (ignoring case) because
     * the title is what links a cost to its saved transactions.
     */
    public synchronized ReccuringCosts create(int day, String title, BigDecimal amount, Long categoryId) {
        String label = normalizeTitle(title);
        int expectedDay = normalizeDay(day);
        BigDecimal expectedAmount = requireAmount(amount);
        long category = requireCategory(categoryId);

        List<ReccuringCosts> existing = repository.findAll();
        if (existing.stream().anyMatch(cost -> sameTitle(cost.title(), label))) {
            throw new IllegalArgumentException("A recurring cost titled \"" + label + "\" already exists.");
        }

        ReccuringCosts created = new ReccuringCosts(expectedDay, label, expectedAmount, category);
        repository.appendAll(List.of(created));
        return created;
    }

    /**
     * Changes an expected recurring cost. The existing title identifies the row;
     * the title in the new values may be different.
     */
    public synchronized ReccuringCosts update(
            String originalTitle, int day, String title, BigDecimal amount, Long categoryId) {
        String key = normalizeTitle(originalTitle);
        String label = normalizeTitle(title);
        int expectedDay = normalizeDay(day);
        BigDecimal expectedAmount = requireAmount(amount);
        long category = requireCategory(categoryId);

        List<ReccuringCosts> existing = repository.findAll();
        ReccuringCosts current = existing.stream()
                .filter(cost -> sameTitle(cost.title(), key))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "Unknown recurring cost \"" + key + "\"."));
        if (!sameTitle(current.title(), label)
                && existing.stream().anyMatch(cost -> sameTitle(cost.title(), label))) {
            throw new IllegalArgumentException("A recurring cost titled \"" + label + "\" already exists.");
        }

        Map<String, String> values = new LinkedHashMap<>();
        values.put("Day", Integer.toString(expectedDay));
        values.put("Title", label);
        values.put("Amount", expectedAmount.toPlainString());
        values.put("Category_Id", Long.toString(category));
        repository.updateRowsByText("Title", current.title(), values);
        return new ReccuringCosts(expectedDay, label, expectedAmount, category);
    }

    /**
     * Removes the recurring cost with the given title.
     */
    public synchronized void delete(String title) {
        String key = normalizeTitle(title);
        if (repository.deleteRowsByText("Title", key) == 0) {
            throw new IllegalArgumentException("Unknown recurring cost \"" + key + "\".");
        }
    }

    private long requireCategory(Long categoryId) {
        long id = categoryId == null ? 0L : categoryId;
        if (id <= 0) {
            throw new IllegalArgumentException("Choose a category for the recurring cost.");
        }
        boolean known = categoryRepository.findAll().stream()
                .map(Category::id)
                .anyMatch(candidate -> candidate == id);
        if (!known) {
            throw new IllegalArgumentException("Unknown category (id " + id + ").");
        }
        return id;
    }

    private static int normalizeDay(int day) {
        if (day < 1 || day > 31) {
            throw new IllegalArgumentException("The expected day must be between 1 and 31.");
        }
        return day;
    }

    private static BigDecimal requireAmount(BigDecimal amount) {
        if (amount == null) {
            throw new IllegalArgumentException("An expected amount is required.");
        }
        return amount;
    }

    private static String normalizeTitle(String value) {
        String title = value == null ? "" : value.trim().replaceAll("\\s+", " ");
        if (title.isEmpty()) {
            throw new IllegalArgumentException("A title is required.");
        }
        return title;
    }

    private static boolean sameTitle(String first, String second) {
        return first != null && second != null && first.trim().equalsIgnoreCase(second.trim());
    }
}
