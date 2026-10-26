package com.cochonbank2.service;

import java.util.Comparator;
import java.util.List;

import org.springframework.stereotype.Service;

import com.cochonbank2.domain.DefaultCategory;
import com.cochonbank2.repository.DefaultCategoryRepository;

@Service
public class DefaultCategoryService {

    private final DefaultCategoryRepository repository;

    public DefaultCategoryService(DefaultCategoryRepository repository) {
        this.repository = repository;
    }

    public List<DefaultCategory> findAll() {
        return repository.findAll().stream()
                .sorted(Comparator.comparingLong(DefaultCategory::id))
                .toList();
    }
}
