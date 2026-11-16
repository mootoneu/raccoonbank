package com.cochonbank2.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.cochonbank2.config.CochonbankProperties;
import com.cochonbank2.domain.Category;
import com.cochonbank2.domain.ReccuringCosts;
import com.cochonbank2.repository.CategoryRepository;
import com.cochonbank2.repository.ReccuringCostsRepository;

class ReccuringCostsServiceTest {

    @TempDir
    Path tempDir;

    private ReccuringCostsService service;

    @BeforeEach
    void setUp() {
        CochonbankProperties properties = new CochonbankProperties(tempDir.toString());
        CategoryRepository categoryRepository = new CategoryRepository(properties);
        categoryRepository.appendAll(List.of(
                new Category(100, 1, 0, "Housing", "Housing", "#8A0000"),
                new Category(110, 1, 10, "Housing", "Water", "#9C2017")));
        service = new ReccuringCostsService(
                new ReccuringCostsRepository(properties), categoryRepository);
    }

    @Test
    void createsRecurringCostsAndWritesTheExpectedCsv() throws Exception {
        ReccuringCosts created = service.create(
                5, "  WATER   BILL ", new BigDecimal("42.50"), 110L);

        assertEquals(new ReccuringCosts(5, "WATER BILL", new BigDecimal("42.50"), 110), created);
        assertEquals(List.of(created), service.findAll());

        Path csv = tempDir.resolve("reccuringcosts.csv");
        List<String> lines = Files.readAllLines(csv, StandardCharsets.UTF_8);
        assertEquals(List.of(
                "Day,Title,Amount,Category_Id",
                "5,WATER BILL,42.50,110"), lines);
    }

    @Test
    void sortsByDayThenTitle() {
        service.create(20, "RENT", new BigDecimal("-800"), 100L);
        service.create(2, "WATER", new BigDecimal("-40"), 110L);
        service.create(2, "ELECTRICITY", new BigDecimal("-60"), 100L);

        assertEquals(List.of("ELECTRICITY", "WATER", "RENT"),
                service.findAll().stream().map(ReccuringCosts::title).toList());
    }

    @Test
    void updatesAndRenamesACost() {
        service.create(5, "WATER", new BigDecimal("-40"), 110L);

        ReccuringCosts updated = service.update(
                "water", 7, "WATER BILL", new BigDecimal("-45.25"), 100L);

        assertEquals(new ReccuringCosts(7, "WATER BILL", new BigDecimal("-45.25"), 100), updated);
        assertEquals(List.of(updated), service.findAll());
    }

    @Test
    void deletesACost() {
        service.create(5, "WATER", new BigDecimal("-40"), 110L);

        service.delete("water");

        assertTrue(service.findAll().isEmpty());
    }

    @Test
    void rejectsDuplicateTitlesIgnoringCase() {
        service.create(5, "WATER", new BigDecimal("-40"), 110L);

        assertThrows(IllegalArgumentException.class,
                () -> service.create(8, " water ", new BigDecimal("-50"), 110L));
    }

    @Test
    void rejectsInvalidValues() {
        assertThrows(IllegalArgumentException.class,
                () -> service.create(0, "WATER", new BigDecimal("-40"), 110L));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(32, "WATER", new BigDecimal("-40"), 110L));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(5, "  ", new BigDecimal("-40"), 110L));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(5, "WATER", null, 110L));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(5, "WATER", new BigDecimal("-40"), 999L));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(5, "WATER", new BigDecimal("-40"), 0L));
        assertThrows(IllegalArgumentException.class,
                () -> service.update("UNKNOWN", 5, "WATER", BigDecimal.ONE, 110L));
        assertThrows(IllegalArgumentException.class,
                () -> service.delete("UNKNOWN"));
    }
}
