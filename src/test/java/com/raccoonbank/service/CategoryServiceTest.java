package com.raccoonbank.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.raccoonbank.config.RaccoonbankProperties;
import com.raccoonbank.config.DataBackupService;
import com.raccoonbank.domain.Category;
import com.raccoonbank.domain.DefaultCategory;
import com.raccoonbank.domain.PlannedSpending;
import com.raccoonbank.domain.ReccuringCosts;
import com.raccoonbank.domain.Transaction;
import com.raccoonbank.repository.CategoryRepository;
import com.raccoonbank.repository.DefaultCategoryRepository;
import com.raccoonbank.repository.PlannedSpendingRepository;
import com.raccoonbank.repository.ReccuringCostsRepository;
import com.raccoonbank.repository.TransactionRepository;

class CategoryServiceTest {

    @TempDir
    Path tempDir;

    private CategoryService service;
    private TransactionRepository transactionRepository;
    private DefaultCategoryRepository defaultCategoryRepository;
    private ReccuringCostsRepository reccuringCostsRepository;
    private PlannedSpendingRepository plannedSpendingRepository;
    private CategoryRepository categoryRepository;

    @BeforeEach
    void setUp() {
        RaccoonbankProperties properties = new RaccoonbankProperties(tempDir.toString());
        categoryRepository = new CategoryRepository(properties);
        transactionRepository = new TransactionRepository(properties);
        defaultCategoryRepository = new DefaultCategoryRepository(properties);
        reccuringCostsRepository = new ReccuringCostsRepository(properties);
        plannedSpendingRepository = new PlannedSpendingRepository(properties);

        categoryRepository.appendAll(List.of(
                new Category(100, 1, 0, "Loyer", "Loyer", "#8b0000"),
                new Category(110, 1, 10, "Loyer", "Eau", "#9c2017"),
                new Category(200, 2, 0, "Voiture", "Voiture", "#ffd700")));
        transactionRepository.appendAll(List.of(
                transaction(1, 110, "-12.50"),
                transaction(2, 100, "-800.00"),
                transaction(3, 0, "-4.20")));
        defaultCategoryRepository.appendAll(List.of(
                new DefaultCategory(1, 110, "VEOLIA", "")));
        reccuringCostsRepository.appendAll(List.of(
                new ReccuringCosts(5, "EAU", new BigDecimal("-12.50"), 110)));
        plannedSpendingRepository.appendAll(List.of(
                new PlannedSpending(LocalDate.of(2026, 11, 27), "Lego sets",
                        new BigDecimal("79.97"), 110L)));

        service = new CategoryService(
                categoryRepository,
                transactionRepository,
                defaultCategoryRepository,
                reccuringCostsRepository,
                plannedSpendingRepository,
                new TransactionService(transactionRepository, categoryRepository),
                new DefaultCategoryService(defaultCategoryRepository, categoryRepository),
                new DataBackupService(properties));
    }

    @Test
    void createsANewGroupWithItsRootCategory() {
        Category created = service.create("  Sport  ", "#00aa00", null);

        assertEquals(new Category(300, 3, 0, "Sport", "Sport", "#00AA00"), created);
        assertTrue(categoryRepository.findAll().contains(created));
    }

    @Test
    void attachesACategoryToAnExistingGroupAsTheNextMember() {
        Category created = service.create("Gaz", "#123456", 1L);

        assertEquals(new Category(120, 1, 20, "Loyer", "Gaz", "#123456"), created);
    }

    @Test
    void usesTheDefaultColorWhenNoneIsGiven() {
        assertEquals("#78909C", service.create("Divers", " ", null).color());
    }

    @Test
    void rejectsAnUnknownOrUncategorizedGroup() {
        assertThrows(IllegalArgumentException.class, () -> service.create("Gaz", "#123456", 9L));
        assertThrows(IllegalArgumentException.class, () -> service.create("Gaz", "#123456", 0L));
    }

    @Test
    void rejectsADuplicateNameIgnoringCase() {
        assertThrows(IllegalArgumentException.class, () -> service.create(" eau ", "#123456", null));
    }

    @Test
    void rejectsAMissingNameOrAnInvalidColor() {
        assertThrows(IllegalArgumentException.class, () -> service.create("  ", "#123456", null));
        assertThrows(IllegalArgumentException.class, () -> service.create("Gaz", "red", null));
    }

    @Test
    void changesTheIdAndMovesTransactionsAndRules() {
        CategoryService.IdChange change = service.changeId(110, 115);

        assertEquals(new CategoryService.IdChange(110, 115, 1, 1), change);
        assertEquals(115L, transactionRepository.findAll().get(0).categoryId());
        assertEquals(100L, transactionRepository.findAll().get(1).categoryId());
        assertEquals(0L, transactionRepository.findAll().get(2).categoryId());
        assertEquals(115L, defaultCategoryRepository.findAll().get(0).categoryId());
        assertEquals(115L, reccuringCostsRepository.findAll().get(0).categoryId());
        assertEquals(115L, plannedSpendingRepository.findAll().get(0).categoryId());
        assertTrue(categoryRepository.findAll().stream().anyMatch(category ->
                category.id() == 115 && category.name().equals("Eau")));
        assertFalse(categoryRepository.findAll().stream().anyMatch(category -> category.id() == 110));
    }

    @Test
    void keepsUntouchedRowsExactlyAsStored() throws Exception {
        Path transactions = transactionRepository.file();
        String before = Files.readString(transactions);

        service.changeId(110, 115);

        String after = Files.readString(transactions);
        assertEquals(before.replace("\n1,110,", "\n1,115,"), after);
    }

    @Test
    void backsUpTheDataBeforeChangingAnId() {
        service.changeId(110, 115);

        assertTrue(Files.isDirectory(tempDir.resolve("backup")));
    }

    @Test
    void rejectsAnIdAlreadyUsedByAnotherCategory() {
        assertThrows(IllegalArgumentException.class, () -> service.changeId(110, 200));
    }

    @Test
    void rejectsAnIdAlreadyUsedByARecord() {
        transactionRepository.appendAll(List.of(transaction(4, 500, "-1.00")));

        assertThrows(IllegalArgumentException.class, () -> service.changeId(110, 500));
    }

    @Test
    void rejectsUncategorizedUnknownAndZeroIds() {
        assertThrows(IllegalArgumentException.class, () -> service.changeId(0, 5));
        assertThrows(IllegalArgumentException.class, () -> service.changeId(999, 5));
        assertThrows(IllegalArgumentException.class, () -> service.changeId(110, 0));
        assertThrows(IllegalArgumentException.class, () -> service.changeId(110, 110));
    }

    @Test
    void deletesACategoryAndMovesItsReferencesToUncategorizedByDefault() {
        CategoryService.Deletion deletion = service.delete(110, 0);

        assertEquals(new CategoryService.Deletion(110, 0, 1, 1), deletion);
        assertEquals(0L, transactionRepository.findAll().get(0).categoryId());
        assertEquals(0L, defaultCategoryRepository.findAll().get(0).categoryId());
        assertEquals(0L, reccuringCostsRepository.findAll().get(0).categoryId());
        assertEquals(0L, plannedSpendingRepository.findAll().get(0).categoryId());
        assertEquals(List.of(100L, 200L), categoryRepository.findAll().stream()
                .map(Category::id)
                .sorted()
                .toList());
    }

    @Test
    void movesTheReferencesToAnotherCategory() {
        CategoryService.Deletion deletion = service.delete(110, 100);

        assertEquals(new CategoryService.Deletion(110, 100, 1, 1), deletion);
        assertEquals(100L, transactionRepository.findAll().get(0).categoryId());
        assertEquals(100L, defaultCategoryRepository.findAll().get(0).categoryId());
    }

    @Test
    void rejectsDeletingUncategorized() {
        assertThrows(IllegalArgumentException.class, () -> service.delete(0, 100));
    }

    @Test
    void rejectsUnknownCategoriesAndReplacements() {
        assertThrows(IllegalArgumentException.class, () -> service.delete(999, 0));
        assertThrows(IllegalArgumentException.class, () -> service.delete(110, 999));
        assertThrows(IllegalArgumentException.class, () -> service.delete(110, 110));
    }

    private static Transaction transaction(long id, long categoryId, String amount) {
        LocalDate date = LocalDate.of(2026, 1, 15);
        return new Transaction(id, categoryId, "DEBIT", new BigDecimal(amount), date, date,
                "TITLE " + id, "", "");
    }
}
