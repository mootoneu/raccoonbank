package com.raccoonbank.repository;

import java.util.List;

import org.springframework.stereotype.Repository;

import com.raccoonbank.config.RaccoonbankProperties;
import com.raccoonbank.csv.AbstractCsvRepository;
import com.raccoonbank.domain.Category;

@Repository
public class CategoryRepository extends AbstractCsvRepository<Category> {

    private static final List<String> HEADER = List.of(
            "Id", "GroupId", "SubId", "GroupName", "Name", "Color");

    public CategoryRepository(RaccoonbankProperties properties) {
        super(properties.dataPath(), "categories.csv", HEADER);
    }

    @Override
    protected Category fromRow(List<String> row) {
        return new Category(
                requiredLong(row, 0, "Id"),
                requiredLong(row, 1, "GroupId"),
                requiredLong(row, 2, "SubId"),
                requiredText(row, 3, "GroupName"),
                requiredText(row, 4, "Name"),
                text(row, 5).isBlank() ? "#78909C" : text(row, 5));
    }

    @Override
    protected List<String> toRow(Category value) {
        return List.of(
                Long.toString(value.id()),
                Long.toString(value.groupId()),
                Long.toString(value.subId()),
                value.groupName(),
                value.name(),
                value.color());
    }
}
