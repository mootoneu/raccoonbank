package com.cochonbank2.repository;

import java.util.List;

import org.springframework.stereotype.Repository;

import com.cochonbank2.config.CochonbankProperties;
import com.cochonbank2.csv.AbstractCsvRepository;
import com.cochonbank2.domain.Category;

@Repository
public class CategoryRepository extends AbstractCsvRepository<Category> {

    private static final List<String> HEADER = List.of("Id", "Name", "Color");

    public CategoryRepository(CochonbankProperties properties) {
        super(properties.dataPath(), "categories.csv", HEADER);
    }

    @Override
    protected Category fromRow(List<String> row) {
        return new Category(
                requiredLong(row, 0, "Id"),
                requiredText(row, 1, "Name"),
                text(row, 2).isBlank() ? "#78909C" : text(row, 2));
    }

    @Override
    protected List<String> toRow(Category value) {
        return List.of(
                Long.toString(value.id()),
                value.name(),
                value.color());
    }
}
