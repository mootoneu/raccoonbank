package com.raccoonbank.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.raccoonbank.config.RaccoonbankProperties;
import com.raccoonbank.domain.Category;
import com.raccoonbank.domain.PlannedSpending;
import com.raccoonbank.repository.CategoryRepository;
import com.raccoonbank.repository.PlannedSpendingRepository;
import com.raccoonbank.service.PlannedSpendingService.Entry;

class PlannedSpendingServiceTest {

    @TempDir
    Path tempDir;

    private PlannedSpendingService service;
    private PlannedSpendingRepository repository;

    @BeforeEach
    void setUp() {
        RaccoonbankProperties properties = new RaccoonbankProperties(tempDir.toString());
        CategoryRepository categoryRepository = new CategoryRepository(properties);
        categoryRepository.appendAll(List.of(
                new Category(490, 4, 90, "Loisir", "Lego", "#69F5E2"),
                new Category(510, 5, 10, "Maison", "Meuble", "#FFAC43")));
        repository = new PlannedSpendingRepository(properties);
        service = new PlannedSpendingService(repository, categoryRepository);
    }

    @Test
    void readsOptionalDueDateAndCategory() {
        repository.appendAll(List.of(
                new PlannedSpending(LocalDate.of(2026, 11, 27), "Lego sets",
                        new BigDecimal("79.97"), 490L),
                new PlannedSpending(null, "Floki vaccin", new BigDecimal("300"), null)));

        List<Entry> all = service.findAll();

        assertEquals(new PlannedSpending(LocalDate.of(2026, 11, 27), "Lego sets",
                new BigDecimal("79.97"), 490L), all.get(0).spending());
        assertNull(all.get(1).spending().dueDate());
        assertNull(all.get(1).spending().categoryId());
    }

    @Test
    void sortsByDueDateWithUndatedItemsLast() {
        service.create(LocalDate.of(2026, 11, 30), "TV", new BigDecimal("499.99"), 510L);
        service.create(null, "Floki vaccin", new BigDecimal("300"), null);
        service.create(LocalDate.of(2026, 11, 27), "Lego sets", new BigDecimal("79.97"), 490L);

        assertEquals(List.of("Lego sets", "TV", "Floki vaccin"),
                service.findAll().stream().map(entry -> entry.spending().title()).toList());
        assertEquals(List.of(0, 1, 2),
                service.findAll().stream().map(Entry::index).toList());
    }

    @Test
    void createsAndWritesTheExpectedCsv() throws Exception {
        Entry created = service.create(
                LocalDate.of(2026, 11, 27), "  Lego   sets ", new BigDecimal("79.97"), 490L);

        assertEquals(new PlannedSpending(LocalDate.of(2026, 11, 27), "Lego sets",
                new BigDecimal("79.97"), 490L), created.spending());
        assertEquals(0, created.index());
        assertEquals(List.of(
                "DueDate,Title,Amount,Category_Id",
                "2026-11-27,Lego sets,79.97,490"),
                Files.readAllLines(tempDir.resolve("panned_spending.csv"), StandardCharsets.UTF_8));
    }

    @Test
    void keepsOptionalColumnsBlank() throws Exception {
        service.create(null, "Floki vaccin", new BigDecimal("300"), null);

        assertEquals(List.of(
                "DueDate,Title,Amount,Category_Id",
                ",Floki vaccin,300,"),
                Files.readAllLines(tempDir.resolve("panned_spending.csv"), StandardCharsets.UTF_8));
    }

    @Test
    void updatesTheRowAtTheGivenDisplayIndex() {
        service.create(LocalDate.of(2026, 11, 27), "Lego sets", new BigDecimal("79.97"), 490L);
        service.create(null, "Floki vaccin", new BigDecimal("300"), null);
        int index = service.findAll().get(1).index();

        Entry updated = service.update(index, LocalDate.of(2026, 12, 1), "Floki vaccin",
                new BigDecimal("350.50"), 510L);

        assertEquals(new PlannedSpending(LocalDate.of(2026, 12, 1), "Floki vaccin",
                new BigDecimal("350.50"), 510L), updated.spending());
        assertEquals(0, service.findAll().get(0).index());
        assertTrue(service.findAll().stream()
                .anyMatch(entry -> entry.spending().title().equals("Floki vaccin")
                        && entry.spending().dueDate().equals(LocalDate.of(2026, 12, 1))));
    }

    @Test
    void deletesTheRowAtTheGivenDisplayIndex() {
        service.create(LocalDate.of(2026, 11, 27), "Lego sets", new BigDecimal("79.97"), 490L);
        service.create(null, "Floki vaccin", new BigDecimal("300"), null);
        int index = service.findAll().get(1).index();

        service.delete(index);

        assertEquals(1, service.findAll().size());
        assertEquals("Lego sets", service.findAll().get(0).spending().title());
    }

    @Test
    void rejectsUnknownIndices() {
        assertThrows(IllegalArgumentException.class, () -> service.delete(0));
        assertThrows(IllegalArgumentException.class,
                () -> service.update(0, null, "TV", new BigDecimal("1"), null));
    }

    @Test
    void validatesTitleAmountAndCategory() {
        assertThrows(IllegalArgumentException.class,
                () -> service.create(null, "  ", new BigDecimal("1"), null));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(null, "TV", null, null));
        assertThrows(IllegalArgumentException.class,
                () -> service.create(null, "TV", new BigDecimal("1"), 999L));
    }
}
