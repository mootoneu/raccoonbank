package com.raccoonbank.repository;

import java.util.List;

import org.springframework.stereotype.Repository;

import com.raccoonbank.config.RaccoonbankProperties;
import com.raccoonbank.csv.AbstractCsvRepository;
import com.raccoonbank.domain.DefaultCategory;

@Repository
public class DefaultCategoryRepository extends AbstractCsvRepository<DefaultCategory> {

    private static final List<String> HEADER = List.of("Id", "Category_Id", "Pattern", "Description");

    public DefaultCategoryRepository(RaccoonbankProperties properties) {
        super(properties.dataPath(), "defaultcategories.csv", HEADER);
    }

    @Override
    protected DefaultCategory fromRow(List<String> row) {
        return new DefaultCategory(
                requiredLong(row, 0, "Id"),
                requiredLong(row, 1, "Category_Id"),
                requiredText(row, 2, "Pattern"),
                text(row, 3));
    }

    @Override
    protected List<String> toRow(DefaultCategory value) {
        return List.of(
                Long.toString(value.id()),
                Long.toString(value.categoryId()),
                value.pattern(),
                value.description() == null ? "" : value.description());
    }
}
