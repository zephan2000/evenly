// Share-set membership matching. Per ADR 0004, share sets are reusable
// participant configurations within a trip. When a user finalizes a share
// group whose membership matches an existing share_set, we reuse it.
// Otherwise we auto-create a new share_set on save.
//
// This file is the source of truth for "same combination of members".
// Membership identity is set-equality on `trip_member_id` — ordering
// doesn't matter, casing isn't relevant (ids are uuids).

export type ShareSetSuggestion = {
  id: string;
  name: string;
  memberIds: readonly string[];
  /** ISO timestamp; suggestions are sorted by this descending. */
  lastUsedAt: string | null;
};

/**
 * Canonical string for a member combination — sorted, pipe-joined.
 * Used as a Map key when matching share sets by composition.
 *
 * Duplicate inputs are collapsed: `membershipKey(['a','a','b']) ===
 * membershipKey(['a','b'])`. Callers should not rely on this — the
 * reducer never emits duplicates — but the helper is forgiving.
 */
export function membershipKey(memberIds: Iterable<string>): string {
  const unique = Array.from(new Set(memberIds));
  unique.sort();
  return unique.join('|');
}

/**
 * Look up an existing share set that has the exact same membership as
 * `memberIds`. Returns null if no match. Comparison is set-equality.
 */
export function findMatchingShareSet(
  memberIds: Iterable<string>,
  existing: readonly ShareSetSuggestion[],
): ShareSetSuggestion | null {
  const target = membershipKey(memberIds);
  for (const set of existing) {
    if (membershipKey(set.memberIds) === target) return set;
  }
  return null;
}

/**
 * Sort share-set suggestions by `lastUsedAt` desc (newest first).
 * Suggestions with null `lastUsedAt` (never used) sort last,
 * with id-asc as the deterministic tie-break.
 */
export function sortByRecency(suggestions: readonly ShareSetSuggestion[]): ShareSetSuggestion[] {
  return suggestions.slice().sort((a, b) => {
    if (a.lastUsedAt && b.lastUsedAt) {
      return a.lastUsedAt > b.lastUsedAt ? -1 : a.lastUsedAt < b.lastUsedAt ? 1 : 0;
    }
    if (a.lastUsedAt && !b.lastUsedAt) return -1;
    if (!a.lastUsedAt && b.lastUsedAt) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Auto-name for a freshly created share set, used when the user hasn't
 * named it themselves. Format: "Member1 + Member2 (+ N more)" capped at
 * two leading names to stay readable on mobile. Pure function of inputs.
 */
export function autoShareSetName(memberDisplayNames: readonly string[]): string {
  const names = memberDisplayNames.filter((n) => n.trim().length > 0);
  if (names.length === 0) return 'Untitled share set';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} + ${names[1]}`;
  return `${names[0]} + ${names[1]} (+${names.length - 2} more)`;
}
