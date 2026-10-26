package com.cochonbank2.domain;

/**
 * A rule assigning a category to imported transactions whose title starts with
 * {@code pattern}. Stored in defaultcategories.csv.
 */
public record DefaultCategory(long id, long categoryId, String pattern) {
}
