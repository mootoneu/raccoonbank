package com.cochonbank2.ofx;

import java.util.List;

/**
 * Result of parsing an OFX file. Invalid statement blocks are skipped and
 * reported as warnings rather than failing the whole import.
 */
public record OfxParseResult(List<OfxStatement> statements, List<String> warnings) {
}
