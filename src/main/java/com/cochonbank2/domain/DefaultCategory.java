package com.cochonbank2.domain;

/**
 * A rule assigning a category to imported transactions whose title starts with
 * {@code pattern}. Stored in defaultcategories.csv.
 *
 * @param description optional note copied onto matching draft transactions;
 *                    empty when the rule has none
 */
public record DefaultCategory(long id, long categoryId, String pattern, String description) {
}
