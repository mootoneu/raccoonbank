package com.cochonbank2.service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.cochonbank2.domain.Category;
import com.cochonbank2.repository.CategoryRepository;

@Service
public class CategoryService {

    private final CategoryRepository repository;

    public CategoryService(CategoryRepository repository) {
        this.repository = repository;
    }

    public List<Category> findAll() {
        return repository.findAll().stream()
                .sorted(Comparator.comparing(Category::name, String.CASE_INSENSITIVE_ORDER))
                .toList();
    }

    public Map<Long, Category> findById() {
        return findAll().stream().collect(Collectors.toMap(Category::id, Function.identity(), (a, b) -> a));
    }
}
