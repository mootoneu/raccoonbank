package com.raccoonbank.service;

import java.io.IOException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import com.raccoonbank.domain.Category;
import com.raccoonbank.domain.DefaultCategory;
import com.raccoonbank.domain.TransactionDraft;
import com.raccoonbank.ofx.OfxParseResult;
import com.raccoonbank.ofx.OfxParser;
import com.raccoonbank.ofx.OfxStatement;
import com.raccoonbank.repository.CategoryRepository;
import com.raccoonbank.repository.DefaultCategoryRepository;

/**
 * Converts the statements of an OFX file into editable transaction drafts. The
 * drafts are not saved: the user reviews/edits them first.
 */
@Service
public class OfxImportService {

    private static final Pattern TRAILING_DATE = Pattern.compile(
            "^(.*?)\\s+(\\d{1,2})/(\\d{1,2})/(\\d{2}|\\d{4})\\s*$");

    private final OfxParser parser;
    private final CategoryRepository categoryRepository;
    private final DefaultCategoryRepository defaultCategoryRepository;

    public OfxImportService(
            OfxParser parser,
            CategoryRepository categoryRepository,
            DefaultCategoryRepository defaultCategoryRepository) {
        this.parser = parser;
        this.categoryRepository = categoryRepository;
        this.defaultCategoryRepository = defaultCategoryRepository;
    }

    public OfxImportResult importFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("The selected OFX file is empty.");
        }
        byte[] content;
        try {
            content = file.getBytes();
        } catch (IOException ex) {
            throw new IllegalStateException("Could not read the uploaded OFX file.", ex);
        }

        Map<Long, Category> categories = categoryRepository.findAll().stream()
                .collect(java.util.stream.Collectors.toMap(Category::id, category -> category, (a, b) -> a));
        List<DefaultCategory> rules = defaultCategoryRepository.findAll().stream()
                .filter(rule -> !normalize(rule.pattern()).isEmpty())
                .filter(rule -> categories.containsKey(rule.categoryId()))
                .sorted(Comparator
                        .comparingInt((DefaultCategory rule) -> normalize(rule.pattern()).length()).reversed()
                        .thenComparingLong(DefaultCategory::id))
                .toList();

        OfxParseResult parsed = parser.parse(content);
        List<TransactionDraft> drafts = new ArrayList<>();
        for (OfxStatement statement : parsed.statements()) {
            TitleAndDate titleAndDate = splitTitleAndDate(statement.name());
            DefaultCategory rule = findRule(titleAndDate.title(), rules);
            long categoryId = rule == null ? 0L : rule.categoryId();
            String description = rule == null ? "" : normalize(rule.description());
            LocalDate realDate = titleAndDate.realDate() == null
                    ? statement.bankDate()
                    : titleAndDate.realDate();
            drafts.add(new TransactionDraft(
                    categoryId,
                    statement.transactionType(),
                    statement.amount(),
                    statement.bankDate(),
                    realDate,
                    titleAndDate.title(),
                    description,
                    ""));
        }

        String fileName = file.getOriginalFilename();
        if (fileName == null || fileName.isBlank()) {
            fileName = "import.ofx";
        }
        return new OfxImportResult(fileName, drafts, parsed.warnings());
    }

    /**
     * Title matching is case-insensitive and whitespace-normalized so that
     * rules created in the review table keep working whatever the bank's
     * capitalization. Rules are pre-sorted by descending pattern length, so the
     * first match is the most specific one.
     */
    static DefaultCategory findRule(String title, List<DefaultCategory> rules) {
        String normalizedTitle = normalize(title);
        for (DefaultCategory rule : rules) {
            String pattern = normalize(rule.pattern());
            if (!pattern.isEmpty()
                    && normalizedTitle.regionMatches(true, 0, pattern, 0, pattern.length())) {
                return rule;
            }
        }
        return null;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().replaceAll("\\s+", " ");
    }

    /**
     * The bank statement NAME is "title dd/MM/yy". The date is removed from the
     * title and becomes the real date. Names without a trailing date are kept
     * as-is; the caller falls back to the bank date.
     */
    static TitleAndDate splitTitleAndDate(String rawName) {
        String name = rawName == null ? "" : rawName.replaceAll("\\s+", " ").trim();
        if (name.isEmpty()) {
            return new TitleAndDate("Unknown transaction", null);
        }
        Matcher matcher = TRAILING_DATE.matcher(name);
        if (!matcher.matches()) {
            return new TitleAndDate(name, null);
        }
        String title = matcher.group(1).trim();
        if (title.isEmpty()) {
            return new TitleAndDate(name, null);
        }
        int day = Integer.parseInt(matcher.group(2));
        int month = Integer.parseInt(matcher.group(3));
        int year = Integer.parseInt(matcher.group(4));
        if (matcher.group(4).length() == 2) {
            year += 2000;
        }
        try {
            return new TitleAndDate(title, java.time.LocalDate.of(year, month, day));
        } catch (java.time.DateTimeException ex) {
            return new TitleAndDate(name, null);
        }
    }

    record TitleAndDate(String title, LocalDate realDate) {
    }
}
