package com.raccoonbank.web;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.raccoonbank.domain.Category;
import com.raccoonbank.service.CategoryService;

@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    @GetMapping
    public List<Category> findAll() {
        return categoryService.findAll();
    }

    @PostMapping
    public ResponseEntity<Category> create(@RequestBody CreateCategoryRequest request) {
        Category created = categoryService.create(request.name(), request.color(), request.groupId());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @PatchMapping("/{id}/id")
    public CategoryService.IdChange changeId(
            @PathVariable("id") long id,
            @RequestBody ChangeCategoryIdRequest request) {
        return categoryService.changeId(id, request.newId());
    }

    @DeleteMapping("/{id}")
    public CategoryService.Deletion delete(
            @PathVariable("id") long id,
            @RequestParam(name = "replacementId", defaultValue = "0") long replacementId) {
        return categoryService.delete(id, replacementId);
    }

    /**
     * A {@code null} group id creates a new group.
     */
    public record CreateCategoryRequest(String name, String color, Long groupId) {
    }

    public record ChangeCategoryIdRequest(long newId) {
    }
}
