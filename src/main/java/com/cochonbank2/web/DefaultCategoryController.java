package com.cochonbank2.web;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.cochonbank2.domain.DefaultCategory;
import com.cochonbank2.service.DefaultCategoryService;

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
}
