import { describe, it, expect } from 'vitest';
import { sanitizeLocalPart, isValidLocalPart, splitName, generateVariations } from '../naming.js';

describe('sanitizeLocalPart', () => {
  it('lowercases input', () => {
    expect(sanitizeLocalPart('Sarah')).toBe('sarah');
    expect(sanitizeLocalPart('HELLO')).toBe('hello');
  });

  it('replaces spaces with hyphens', () => {
    expect(sanitizeLocalPart('sarah shield')).toBe('sarah-shield');
    expect(sanitizeLocalPart('sarah  shield')).toBe('sarah-shield');
  });

  it('replaces underscores with hyphens', () => {
    expect(sanitizeLocalPart('sarah_shield')).toBe('sarah-shield');
  });

  it('strips invalid characters', () => {
    expect(sanitizeLocalPart('sarah!@#shield')).toBe('sarahshield');
    expect(sanitizeLocalPart('café')).toBe('caf');
  });

  it('collapses consecutive hyphens', () => {
    expect(sanitizeLocalPart('sarah---shield')).toBe('sarah-shield');
  });

  it('collapses consecutive dots', () => {
    expect(sanitizeLocalPart('sarah...shield')).toBe('sarah.shield');
  });

  it('trims leading and trailing separators', () => {
    expect(sanitizeLocalPart('-sarah-')).toBe('sarah');
    expect(sanitizeLocalPart('.sarah.')).toBe('sarah');
    expect(sanitizeLocalPart('_sarah_')).toBe('sarah');
  });

  it('truncates to 64 characters', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeLocalPart(long)).toHaveLength(64);
  });

  it('trims trailing separators after truncation', () => {
    // 63 a's followed by a hyphen = 64 chars, but the trailing hyphen should be trimmed
    const input = 'a'.repeat(63) + '-rest';
    const result = sanitizeLocalPart(input);
    expect(result.length).toBeLessThanOrEqual(64);
    expect(result).not.toMatch(/[._-]$/);
  });

  it('returns empty string for all-invalid input', () => {
    expect(sanitizeLocalPart('!@#$%')).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(sanitizeLocalPart('')).toBe('');
  });
});

describe('isValidLocalPart', () => {
  it('accepts valid local parts', () => {
    expect(isValidLocalPart('sarah-shield')).toBe(true);
    expect(isValidLocalPart('sarah.shield')).toBe(true);
    expect(isValidLocalPart('sarahshield')).toBe(true);
    expect(isValidLocalPart('abc')).toBe(true);
    expect(isValidLocalPart('s-shield')).toBe(true);
    expect(isValidLocalPart('billing-bot')).toBe(true);
  });

  it('rejects too short (< 3 chars)', () => {
    expect(isValidLocalPart('ab')).toBe(false);
    expect(isValidLocalPart('a')).toBe(false);
    expect(isValidLocalPart('')).toBe(false);
  });

  it('rejects too long (> 64 chars)', () => {
    expect(isValidLocalPart('a'.repeat(65))).toBe(false);
  });

  it('rejects invalid characters', () => {
    expect(isValidLocalPart('sarah shield')).toBe(false);
    expect(isValidLocalPart('UPPER')).toBe(false);
    expect(isValidLocalPart('sarah!')).toBe(false);
  });

  it('rejects strings that start or end with separators', () => {
    expect(isValidLocalPart('-sarah')).toBe(false);
    expect(isValidLocalPart('sarah-')).toBe(false);
    expect(isValidLocalPart('.sarah')).toBe(false);
  });

  it('rejects reserved words', () => {
    expect(isValidLocalPart('admin')).toBe(false);
    expect(isValidLocalPart('postmaster')).toBe(false);
    expect(isValidLocalPart('lobster')).toBe(false);
    expect(isValidLocalPart('lobstermail')).toBe(false);
    expect(isValidLocalPart('support')).toBe(false);
    expect(isValidLocalPart('test')).toBe(false);
  });

  it('accepts exactly 3 characters', () => {
    expect(isValidLocalPart('mia')).toBe(true);
  });

  it('accepts exactly 64 characters', () => {
    expect(isValidLocalPart('a'.repeat(64))).toBe(true);
  });
});

describe('splitName', () => {
  it('splits hyphenated names', () => {
    expect(splitName('sarah-shield')).toEqual(['sarah', 'shield']);
  });

  it('splits dotted names', () => {
    expect(splitName('sarah.shield')).toEqual(['sarah', 'shield']);
  });

  it('splits spaced names', () => {
    expect(splitName('Sarah Shield')).toEqual(['sarah', 'shield']);
  });

  it('splits underscored names', () => {
    expect(splitName('sarah_shield')).toEqual(['sarah', 'shield']);
  });

  it('splits camelCase names', () => {
    expect(splitName('sarahShield')).toEqual(['sarah', 'shield']);
  });

  it('handles single-word names', () => {
    expect(splitName('mia')).toEqual(['mia']);
  });

  it('handles multi-part names', () => {
    expect(splitName('Sarah Jane Shield')).toEqual(['sarah', 'jane', 'shield']);
  });

  it('trims whitespace', () => {
    expect(splitName('  sarah  ')).toEqual(['sarah']);
  });
});

describe('generateVariations', () => {
  it('generates variations for two-part name with org (no dot variations)', () => {
    const result = generateVariations({ name: 'Sarah Shield', org: 'Palisade' });
    expect(result).toEqual([
      'sarah-shield',
      'sarah-shield-palisade',
      's-shield',
      'sarah-shield1',
      'sarah-shield2',
      'sarah-shield3',
      'sarah-shield4',
      'sarah-shield5',
    ]);
  });

  it('generates variations for two-part name without org', () => {
    const result = generateVariations({ name: 'Sarah Shield' });
    expect(result).toEqual([
      'sarah-shield',
      's-shield',
      'sarah-shield1',
      'sarah-shield2',
      'sarah-shield3',
      'sarah-shield4',
      'sarah-shield5',
    ]);
  });

  it('generates variations for single-part name with org', () => {
    const result = generateVariations({ name: 'Mia', org: 'Acme' });
    expect(result).toEqual([
      'mia',
      'mia-acme',
      'mia1',
      'mia2',
      'mia3',
      'mia4',
      'mia5',
    ]);
  });

  it('generates variations for single-part name without org', () => {
    const result = generateVariations({ name: 'Mia' });
    expect(result).toEqual([
      'mia',
      'mia1',
      'mia2',
      'mia3',
      'mia4',
      'mia5',
    ]);
  });

  it('does not generate dot-separated variations (dot equivalence)', () => {
    const result = generateVariations({ name: 'Sarah Shield' });
    // No dot-based variations should appear
    expect(result).not.toContain('sarah.shield');
    expect(result).not.toContain('sarahshield');
    expect(result).not.toContain('s.shield');
  });

  it('handles dot-separated input names', () => {
    // Input "sarah.shield" is split into ["sarah", "shield"] — same as spaced/hyphenated
    const result = generateVariations({ name: 'sarah.shield' });
    expect(result[0]).toBe('sarah-shield');
    expect(result).not.toContain('sarah.shield');
    expect(result).not.toContain('sarahshield');
  });

  it('handles camelCase names', () => {
    const result = generateVariations({ name: 'sarahShield' });
    expect(result[0]).toBe('sarah-shield');
    expect(result).toContain('s-shield');
    expect(result).not.toContain('sarah.shield');
  });

  it('includes numbered fallbacks after name variations', () => {
    const result = generateVariations({ name: 'Sarah Shield' });
    // Last 5 entries should be numbered
    expect(result).toContain('sarah-shield1');
    expect(result).toContain('sarah-shield2');
    expect(result).toContain('sarah-shield3');
    expect(result).toContain('sarah-shield4');
    expect(result).toContain('sarah-shield5');
  });

  it('numbered fallbacks use the base form', () => {
    const result = generateVariations({ name: 'Mia', org: 'Acme' });
    // Base form for single-part is "mia"
    expect(result).toContain('mia1');
    expect(result).toContain('mia5');
    // Not "mia-acme1"
    expect(result).not.toContain('mia-acme1');
  });

  it('deduplicates results', () => {
    const result = generateVariations({ name: 'Sarah Shield' });
    const unique = new Set(result);
    expect(result.length).toBe(unique.size);
  });

  it('filters out invalid entries', () => {
    // Single-char name would produce "m" as initial variation — too short
    const result = generateVariations({ name: 'M' });
    // "m" is too short (< 3 chars), but "m1"..."m5" are also too short (2 chars)
    expect(result).toEqual([]);
  });

  it('returns empty for empty name', () => {
    expect(generateVariations({ name: '' })).toEqual([]);
    expect(generateVariations({ name: '  ' })).toEqual([]);
  });

  it('returns empty for undefined name', () => {
    expect(generateVariations({})).toEqual([]);
    expect(generateVariations({ org: 'Acme' })).toEqual([]);
  });

  it('handles special characters in name', () => {
    const result = generateVariations({ name: "Sarah O'Shield" });
    // After sanitization: "sarah" and "oshield" (apostrophe stripped)
    expect(result.length).toBeGreaterThan(0);
    for (const v of result) {
      expect(isValidLocalPart(v)).toBe(true);
    }
  });

  it('handles long names by truncating', () => {
    const longName = 'a'.repeat(40) + ' ' + 'b'.repeat(40);
    const result = generateVariations({ name: longName });
    for (const v of result) {
      expect(v.length).toBeLessThanOrEqual(64);
      expect(isValidLocalPart(v)).toBe(true);
    }
  });

  it('org with special characters is sanitized', () => {
    const result = generateVariations({ name: 'Sarah Shield', org: 'Acme Corp!' });
    // Should include sarah-shield-acme-corp
    expect(result).toContain('sarah-shield-acme-corp');
  });
});
