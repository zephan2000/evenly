import { describe, expect, it } from 'vitest';

import {
  formatMinor,
  formatTypedDisplay,
  getCurrencyDecimals,
  parseToMinor,
  sanitizeTyped,
} from '../currency';

describe('getCurrencyDecimals', () => {
  it('returns 2 for common 2-decimal currencies', () => {
    expect(getCurrencyDecimals('SGD')).toBe(2);
    expect(getCurrencyDecimals('USD')).toBe(2);
    expect(getCurrencyDecimals('EUR')).toBe(2);
    expect(getCurrencyDecimals('MYR')).toBe(2);
  });

  it('returns 0 for zero-decimal currencies', () => {
    expect(getCurrencyDecimals('JPY')).toBe(0);
    expect(getCurrencyDecimals('KRW')).toBe(0);
    expect(getCurrencyDecimals('VND')).toBe(0);
  });

  it('returns 3 for three-decimal currencies', () => {
    expect(getCurrencyDecimals('BHD')).toBe(3);
    expect(getCurrencyDecimals('KWD')).toBe(3);
    expect(getCurrencyDecimals('OMR')).toBe(3);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(getCurrencyDecimals('sgd')).toBe(2);
    expect(getCurrencyDecimals('  jpy  ')).toBe(0);
  });

  it('falls back to 2 for unknown codes', () => {
    expect(getCurrencyDecimals('XYZ')).toBe(2);
  });
});

describe('formatMinor', () => {
  it('formats 2-decimal currencies', () => {
    expect(formatMinor(2038n, 'SGD')).toBe('20.38');
    expect(formatMinor(0n, 'USD')).toBe('0.00');
    expect(formatMinor(5n, 'EUR')).toBe('0.05');
    expect(formatMinor(100n, 'USD')).toBe('1.00');
  });

  it('formats 0-decimal currencies', () => {
    expect(formatMinor(1234n, 'JPY')).toBe('1,234');
    expect(formatMinor(0n, 'KRW')).toBe('0');
    expect(formatMinor(123456789n, 'JPY')).toBe('123,456,789');
  });

  it('formats 3-decimal currencies', () => {
    expect(formatMinor(1500n, 'BHD')).toBe('1.500');
    expect(formatMinor(1n, 'BHD')).toBe('0.001');
  });

  it('inserts group separators in the integer portion', () => {
    expect(formatMinor(1234567n, 'SGD')).toBe('12,345.67');
    expect(formatMinor(100000000n, 'SGD')).toBe('1,000,000.00');
  });

  it('handles negative amounts', () => {
    expect(formatMinor(-2038n, 'SGD')).toBe('-20.38');
    expect(formatMinor(-1234n, 'JPY')).toBe('-1,234');
  });
});

describe('parseToMinor', () => {
  it('parses simple 2-decimal strings', () => {
    expect(parseToMinor('20.38', 'SGD')).toBe(2038n);
    expect(parseToMinor('0.05', 'EUR')).toBe(5n);
    expect(parseToMinor('1', 'SGD')).toBe(100n);
  });

  it('tolerates group separators', () => {
    expect(parseToMinor('1,234.56', 'SGD')).toBe(123456n);
    expect(parseToMinor('1,000,000', 'SGD')).toBe(100000000n);
  });

  it('pads short fractions to currency decimals', () => {
    expect(parseToMinor('1.5', 'SGD')).toBe(150n);
    expect(parseToMinor('1.', 'SGD')).toBe(100n);
  });

  it('truncates excess fraction digits (no rounding)', () => {
    expect(parseToMinor('1.999', 'SGD')).toBe(199n);
    expect(parseToMinor('1.5', 'JPY')).toBe(1n);
  });

  it('parses 0-decimal currencies', () => {
    expect(parseToMinor('1234', 'JPY')).toBe(1234n);
    expect(parseToMinor('0', 'JPY')).toBe(0n);
  });

  it('parses 3-decimal currencies', () => {
    expect(parseToMinor('1.500', 'BHD')).toBe(1500n);
    expect(parseToMinor('0.001', 'BHD')).toBe(1n);
  });

  it('handles negatives', () => {
    expect(parseToMinor('-20.38', 'SGD')).toBe(-2038n);
  });

  it('returns null for unparseable input', () => {
    expect(parseToMinor('', 'SGD')).toBeNull();
    expect(parseToMinor('abc', 'SGD')).toBeNull();
    expect(parseToMinor('.', 'SGD')).toBeNull();
    expect(parseToMinor('-', 'SGD')).toBeNull();
    expect(parseToMinor('1.2.3', 'SGD')).toBeNull();
  });
});

describe('sanitizeTyped', () => {
  it('drops non-digit characters', () => {
    expect(sanitizeTyped('1a2b3', 'SGD')).toBe('123');
    expect(sanitizeTyped('S$20.38', 'SGD')).toBe('20.38');
  });

  it('keeps a single leading minus', () => {
    expect(sanitizeTyped('-20', 'SGD')).toBe('-20');
    expect(sanitizeTyped('--20', 'SGD')).toBe('-20');
  });

  it('collapses multiple decimal points', () => {
    expect(sanitizeTyped('1.2.3', 'SGD')).toBe('1.23');
  });

  it('clamps fraction to currency decimals', () => {
    expect(sanitizeTyped('1.999', 'SGD')).toBe('1.99');
    expect(sanitizeTyped('1.99999', 'BHD')).toBe('1.999');
  });

  it('strips decimals entirely for 0-decimal currencies', () => {
    expect(sanitizeTyped('1.5', 'JPY')).toBe('15');
    expect(sanitizeTyped('1.', 'JPY')).toBe('1');
  });

  it('preserves a trailing decimal point while typing', () => {
    expect(sanitizeTyped('1.', 'SGD')).toBe('1.');
    expect(sanitizeTyped('1.5', 'SGD')).toBe('1.5');
  });

  it('strips leading zeros but keeps a leading 0 before a decimal', () => {
    expect(sanitizeTyped('00012', 'SGD')).toBe('12');
    expect(sanitizeTyped('0.5', 'SGD')).toBe('0.5');
    expect(sanitizeTyped('0', 'SGD')).toBe('0');
  });
});

describe('formatTypedDisplay', () => {
  it('inserts group separators in the integer portion', () => {
    expect(formatTypedDisplay('1234')).toBe('1,234');
    expect(formatTypedDisplay('1234567')).toBe('1,234,567');
  });

  it('preserves trailing decimal and partial fractions while typing', () => {
    expect(formatTypedDisplay('1234.')).toBe('1,234.');
    expect(formatTypedDisplay('1234.5')).toBe('1,234.5');
    expect(formatTypedDisplay('1234.56')).toBe('1,234.56');
  });

  it('handles negatives', () => {
    expect(formatTypedDisplay('-1234.5')).toBe('-1,234.5');
  });

  it('returns empty for empty input', () => {
    expect(formatTypedDisplay('')).toBe('');
  });
});
