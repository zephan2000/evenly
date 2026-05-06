// Currency utilities — minor-unit math + formatting.
//
// Money is stored as `bigint` minor units (docs/data-model.md). Decimals are
// fixed per ISO 4217 — e.g. JPY has 0, SGD/USD/EUR have 2, BHD/KWD/JOD/OMR
// have 3. The full ISO 4217 list runs ~180 codes; we ship the codes we
// actually surface in M1 + the long-tail exceptions, and default everything
// else to 2 decimals (correct for the vast majority of currencies).

const DECIMALS_BY_CODE: Record<string, number> = {
  // 2-decimal — explicit so the M1 chip selector never has to fall through
  SGD: 2,
  USD: 2,
  EUR: 2,
  MYR: 2,
  GBP: 2,
  AUD: 2,
  NZD: 2,
  HKD: 2,
  CHF: 2,
  CNY: 2,
  THB: 2,
  IDR: 2,
  PHP: 2,
  INR: 2,
  // 0-decimal exceptions
  JPY: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  // 3-decimal exceptions
  BHD: 3,
  KWD: 3,
  JOD: 3,
  OMR: 3,
  TND: 3,
};

const DEFAULT_DECIMALS = 2;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function getCurrencyDecimals(code: string): number {
  const c = normalizeCode(code);
  return DECIMALS_BY_CODE[c] ?? DEFAULT_DECIMALS;
}

// Group separator + decimal separator — locked to en-US conventions for M1.
// Localization is post-MVP; when it lands, route through Intl.NumberFormat.
const GROUP_SEP = ',';
const DECIMAL_SEP = '.';

function insertGroupSeparators(intDigits: string): string {
  if (intDigits.length <= 3) return intDigits;
  const out: string[] = [];
  for (let i = intDigits.length; i > 0; i -= 3) {
    out.unshift(intDigits.slice(Math.max(0, i - 3), i));
  }
  return out.join(GROUP_SEP);
}

/**
 * Format minor units as a localized string with the right number of decimals
 * for the currency. Does NOT include the currency symbol — components decide
 * how to label (chip vs prefix vs suffix). Negative values get a leading `-`.
 *
 * @example
 * formatMinor(2038n, 'SGD') === '20.38'
 * formatMinor(123456789n, 'JPY') === '123,456,789'
 * formatMinor(1000n, 'BHD') === '1.000'
 */
export function formatMinor(minor: bigint, code: string): string {
  const decimals = getCurrencyDecimals(code);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const str = abs.toString();

  if (decimals === 0) {
    return (negative ? '-' : '') + insertGroupSeparators(str);
  }

  const padded = str.padStart(decimals + 1, '0');
  const intPart = padded.slice(0, padded.length - decimals);
  const fracPart = padded.slice(padded.length - decimals);
  return (negative ? '-' : '') + insertGroupSeparators(intPart) + DECIMAL_SEP + fracPart;
}

/**
 * Parse a user-typed string into minor units. Tolerates group separators and
 * a single leading minus. Truncates excess fraction digits (does not round —
 * the field clamps input to the right number of decimals as the user types,
 * so excess only happens when the currency changes underneath an existing
 * value, in which case truncation is the safer move). Returns `null` for
 * unparseable strings, including the empty string and lone `-`/`.`.
 *
 * @example
 * parseToMinor('20.38', 'SGD') === 2038n
 * parseToMinor('1,234.5', 'SGD') === 123450n
 * parseToMinor('1234', 'JPY') === 1234n
 * parseToMinor('1.500', 'BHD') === 1500n
 */
export function parseToMinor(input: string, code: string): bigint | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  if (!body) return null;

  // Strip group separators; allow only digits + at most one decimal point.
  const stripped = body.replace(/,/g, '');
  if (!/^[0-9]*\.?[0-9]*$/.test(stripped)) return null;
  if (stripped === '.' || stripped === '') return null;

  const decimals = getCurrencyDecimals(code);
  const [intRaw, fracRaw = ''] = stripped.split('.');
  const intDigits = intRaw === '' ? '0' : intRaw;
  const fracDigits = decimals === 0 ? '' : fracRaw.slice(0, decimals).padEnd(decimals, '0');
  const combined = intDigits + fracDigits;
  if (!/^[0-9]+$/.test(combined)) return null;

  const minor = BigInt(combined);
  return negative ? -minor : minor;
}

/**
 * Sanitize an in-progress text-field string to what the user is allowed to
 * type for this currency. Keeps the leading `-` if present, strips group
 * separators (we re-add them on display), allows at most one decimal point,
 * and clamps the fraction to the currency's decimals.
 *
 * Returns the cleaned raw value (no group separators) — pair with
 * `formatTypedDisplay` if you want to show separators while typing.
 */
export function sanitizeTyped(input: string, code: string): string {
  if (!input) return '';
  const negative = input.startsWith('-');
  const body = negative ? input.slice(1) : input;

  // Drop everything that isn't a digit or a decimal point.
  let cleaned = body.replace(/[^0-9.]/g, '');

  // Collapse multiple decimal points to the first one.
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }

  const decimals = getCurrencyDecimals(code);
  if (decimals === 0) {
    cleaned = cleaned.replace(/\./g, '');
  } else if (firstDot !== -1) {
    const [intPart, fracPart = ''] = cleaned.split('.');
    cleaned = intPart + '.' + fracPart.slice(0, decimals);
  }

  // Strip leading zeros except a single zero before the decimal point.
  cleaned = cleaned.replace(/^0+(?=[0-9])/, '');

  return (negative ? '-' : '') + cleaned;
}

/**
 * Take a sanitized typed string and add group separators to the integer
 * portion. Preserves any trailing decimal point or partial fraction the user
 * is mid-typing (e.g. "1234." → "1,234.", "1234.5" → "1,234.5").
 */
export function formatTypedDisplay(sanitized: string): string {
  if (!sanitized) return '';
  const negative = sanitized.startsWith('-');
  const body = negative ? sanitized.slice(1) : sanitized;
  const dotIdx = body.indexOf('.');
  const intPart = dotIdx === -1 ? body : body.slice(0, dotIdx);
  const rest = dotIdx === -1 ? '' : body.slice(dotIdx);
  const grouped = intPart === '' ? '' : insertGroupSeparators(intPart);
  return (negative ? '-' : '') + grouped + rest;
}
