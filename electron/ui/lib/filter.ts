// Filter predicate — case-insensitive substring match for the browse lists (BROWSE-04/05).
//
// owns: the as-you-type filter test for bank items and skills (matched against the raw namespaced
// id). Deliberately a plain `String.prototype.includes` on lowercased strings — NEVER
// a user-input-derived pattern (mitigates T-05-06: the query is untrusted renderer input, so a
// compiled pattern would be a ReDoS / injection surface). At 689 rows × includes the match is
// sub-millisecond, so callers filter synchronously per keystroke with no debounce.

/**
 * Case-insensitive substring test: does `id` contain `query` (ignoring case)? An empty query
 * matches every id. The query is treated as a LITERAL — regex metacharacters have no special
 * meaning and are never compiled into a pattern.
 *
 * @param query The untrusted filter text (renderer input).
 * @param id The candidate id to test (e.g. `MelvorBase:NormalLog`).
 * @returns `true` when the query is empty or is a case-insensitive substring of `id`.
 */
export function matches(query: string, id: string): boolean {
  if (query === '') return true;
  return id.toLowerCase().includes(query.toLowerCase());
}
