package com.cochonbank2.domain;

/**
 * A transaction category, stored in categories.csv.
 *
 * @param id    positive identifier, 0 is reserved for "uncategorized"
 * @param name  display name
 * @param color CSS hexadecimal color used as background in the UI
 */
public record Category(long id, String name, String color) {
}
