package com.cochonbank2.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import com.cochonbank2.config.CochonbankProperties;
import com.cochonbank2.domain.Category;
import com.cochonbank2.domain.DefaultCategory;
import com.cochonbank2.repository.CategoryRepository;
import com.cochonbank2.repository.DefaultCategoryRepository;

class DefaultCategoryServiceTest {

    @TempDir
    Path tempDir;

    private DefaultCategoryService service;

    @BeforeEach
    void setUp() {
        CochonbankProperties properties = new CochonbankProperties(tempDir.toString());
        CategoryRepository categoryRepository = new CategoryRepository(properties);
        DefaultCategoryRepository defaultCategoryRepository = new DefaultCategoryRepository(properties);

        categoryRepository.appendAll(List.of(
                new Category(10, 0, 10, "Groceries", "Groceries", "#2E7D32"),
                new Category(50, 0, 50, "Pets", "Pets", "#795548")));
        defaultCategoryRepository.appendAll(List.of(
                new DefaultCategory(3, 10, "CARREFOUR", "")));

        service = new DefaultCategoryService(defaultCategoryRepository, categoryRepository);
    }

    @Test
    void createsARuleFromTheLineWithTheNextId() {
        DefaultCategory created = service.create(50, "  ANIMAL   SHOP  ", "  Weekly   pet  food ");

        assertEquals(4L, created.id());
        assertEquals(50L, created.categoryId());
        assertEquals("ANIMAL SHOP", created.pattern());
        assertEquals("Weekly pet food", created.description());
        assertEquals(List.of(
                new DefaultCategory(3, 10, "CARREFOUR", ""),
                new DefaultCategory(4, 50, "ANIMAL SHOP", "Weekly pet food")), service.findAll());
    }

    @Test
    void defaultsTheDescriptionToEmpty() {
        assertEquals("", service.create(50, "VET", null).description());
        assertEquals("", service.create(50, "VET CLINIC", "   ").description());
    }

    @Test
    void rejectsABlankTitle() {
        assertThrows(IllegalArgumentException.class, () -> service.create(10, "   ", ""));
        assertThrows(IllegalArgumentException.class, () -> service.create(10, null, ""));
    }

    @Test
    void rejectsUncategorizedAndUnknownCategories() {
        assertThrows(IllegalArgumentException.class, () -> service.create(0, "SOMETHING", ""));
        assertThrows(IllegalArgumentException.class, () -> service.create(99, "SOMETHING", ""));
    }

    @Test
    void rejectsADuplicateTitleIgnoringCaseAndSpaces() {
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.create(50, " carrefour ", ""));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
    }
}
