package com.cochonbank2.domain;

/**
 * A transaction category, stored in categories.csv.
 *
 * <p>Categories are grouped explicitly. Within a group, the category with
 * {@code subId == 0} is the group root, and {@code groupName} is that root's
 * name. The category identifiers follow the same layout: {@code id} is
 * {@code groupId * 100 + subId}.</p>
 *
 * @param id        identifier, 0 is reserved for "uncategorized"
 * @param groupId   identifier of the group this category belongs to
 * @param subId     position inside the group, 0 for the group root
 * @param groupName display name of the group root
 * @param name      display name
 * @param color     CSS hexadecimal color used as background in the UI
 */
public record Category(
        long id,
        long groupId,
        long subId,
        String groupName,
        String name,
        String color) {
}
