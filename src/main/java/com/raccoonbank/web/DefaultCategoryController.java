package com.raccoonbank.web;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.raccoonbank.domain.DefaultCategory;
import com.raccoonbank.service.DefaultCategoryService;

@RestController
@RequestMapping("/api/default-categories")
public class DefaultCategoryController {

    private final DefaultCategoryService defaultCategoryService;

    public DefaultCategoryController(DefaultCategoryService defaultCategoryService) {
        this.defaultCategoryService = defaultCategoryService;
    }

    @GetMapping
    public List<DefaultCategory> findAll() {
        return defaultCategoryService.findAll();
    }

    @PostMapping
    public ResponseEntity<DefaultCategory> create(@RequestBody CreateDefaultCategoryRequest request) {
        DefaultCategory created = defaultCategoryService.create(
                request.categoryId(), request.pattern(), request.description());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    public record CreateDefaultCategoryRequest(long categoryId, String pattern, String description) {
    }
}
