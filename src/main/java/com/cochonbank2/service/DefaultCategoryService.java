package com.cochonbank2.service;

import java.util.Comparator;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.cochonbank2.domain.Category;
import com.cochonbank2.domain.DefaultCategory;
import com.cochonbank2.repository.CategoryRepository;
import com.cochonbank2.repository.DefaultCategoryRepository;

@Service
public class DefaultCategoryService {

    private final DefaultCategoryRepository repository;
    private final CategoryRepository categoryRepository;

    public DefaultCategoryService(
            DefaultCategoryRepository repository,
            CategoryRepository categoryRepository) {
        this.repository = repository;
        this.categoryRepository = categoryRepository;
    }

    public List<DefaultCategory> findAll() {
        return repository.findAll().stream()
                .sorted(Comparator.comparingLong(DefaultCategory::id))
                .toList();
    }

    /**
     * Creates a title-matching rule from a reviewed import line: future imports
     * whose title starts with {@code pattern} get {@code categoryId} and, when
     * given, {@code description}. Repeated whitespace is collapsed so the
     * stored pattern matches the normalized titles produced by the OFX parser.
     */
    public synchronized DefaultCategory create(long categoryId, String pattern, String description) {
        String normalized = normalize(pattern);
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("A title is required to create a default category.");
        }
        if (categoryId <= 0) {
            throw new IllegalArgumentException("Choose a category before creating a default category.");
        }

        boolean knownCategory = categoryRepository.findAll().stream()
                .map(Category::id)
                .anyMatch(id -> id == categoryId);
        if (!knownCategory) {
            throw new IllegalArgumentException("Unknown category (id " + categoryId + ").");
        }

        List<DefaultCategory> existing = repository.findAll();
        boolean duplicate = existing.stream()
                .map(rule -> normalize(rule.pattern()))
                .anyMatch(normalized::equalsIgnoreCase);
        if (duplicate) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A default category already exists for \"" + normalized + "\".");
        }

        long nextId = existing.stream().mapToLong(DefaultCategory::id).max().orElse(0L) + 1;
        DefaultCategory created = new DefaultCategory(nextId, categoryId, normalized, normalize(description));
        repository.appendAll(List.of(created));
        return created;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }
}
