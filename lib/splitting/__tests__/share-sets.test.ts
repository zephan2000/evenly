import { describe, expect, it } from 'vitest';

import {
  autoShareSetName,
  findMatchingShareSet,
  membershipKey,
  sortByRecency,
  type ShareSetSuggestion,
} from '../share-sets';

// ─── membershipKey ───────────────────────────────────────────────────────

describe('membershipKey', () => {
  it('is order-invariant', () => {
    expect(membershipKey(['a', 'b', 'c'])).toBe(membershipKey(['c', 'b', 'a']));
  });

  it('collapses duplicates', () => {
    expect(membershipKey(['a', 'a', 'b'])).toBe(membershipKey(['a', 'b']));
  });

  it('is case-sensitive (member ids are UUIDs)', () => {
    expect(membershipKey(['A'])).not.toBe(membershipKey(['a']));
  });

  it('handles empty input', () => {
    expect(membershipKey([])).toBe('');
  });
});

// ─── findMatchingShareSet ────────────────────────────────────────────────

describe('findMatchingShareSet', () => {
  const sets: ShareSetSuggestion[] = [
    { id: 'set-all', name: 'All 4', memberIds: ['a', 'b', 'c', 'd'], lastUsedAt: null },
    { id: 'set-za', name: 'Z + A', memberIds: ['z', 'a'], lastUsedAt: null },
    { id: 'set-zo', name: 'Solo Z', memberIds: ['z'], lastUsedAt: null },
  ];

  it('returns the set when membership matches exactly (order-insensitive)', () => {
    expect(findMatchingShareSet(['a', 'z'], sets)?.id).toBe('set-za');
    expect(findMatchingShareSet(['d', 'c', 'b', 'a'], sets)?.id).toBe('set-all');
  });

  it('returns null when no set matches', () => {
    expect(findMatchingShareSet(['a', 'b'], sets)).toBeNull();
  });

  it('returns null for an empty input even when an empty set exists', () => {
    // We don't store empty sets, and the reducer rejects them. The matcher
    // simply can't return one because there isn't one to find.
    expect(findMatchingShareSet([], sets)).toBeNull();
  });

  it('does not over-match when target is a subset of an existing set', () => {
    // ['a','b','c'] is a subset of set-all (['a','b','c','d']) but not
    // an exact match.
    expect(findMatchingShareSet(['a', 'b', 'c'], sets)).toBeNull();
  });
});

// ─── sortByRecency ───────────────────────────────────────────────────────

describe('sortByRecency', () => {
  it('puts newest lastUsedAt first', () => {
    const out = sortByRecency([
      { id: 'a', name: 'A', memberIds: ['x'], lastUsedAt: '2026-04-01T00:00:00Z' },
      { id: 'b', name: 'B', memberIds: ['y'], lastUsedAt: '2026-05-01T00:00:00Z' },
    ]);
    expect(out.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('puts nulls last with id-asc tie-break', () => {
    const out = sortByRecency([
      { id: 'never-b', name: '', memberIds: [], lastUsedAt: null },
      { id: 'used', name: '', memberIds: [], lastUsedAt: '2026-01-01T00:00:00Z' },
      { id: 'never-a', name: '', memberIds: [], lastUsedAt: null },
    ]);
    expect(out.map((s) => s.id)).toEqual(['used', 'never-a', 'never-b']);
  });
});

// ─── autoShareSetName ────────────────────────────────────────────────────

describe('autoShareSetName', () => {
  it('produces a placeholder when no names are usable', () => {
    expect(autoShareSetName([])).toBe('Untitled share set');
    expect(autoShareSetName(['', '   '])).toBe('Untitled share set');
  });

  it('uses one name verbatim', () => {
    expect(autoShareSetName(['Zephan'])).toBe('Zephan');
  });

  it('joins two names with +', () => {
    expect(autoShareSetName(['Zephan', 'Alika'])).toBe('Zephan + Alika');
  });

  it('truncates with +N more when more than two', () => {
    expect(autoShareSetName(['A', 'B', 'C', 'D'])).toBe('A + B (+2 more)');
  });
});
