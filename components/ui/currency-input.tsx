import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput as RNTextInput,
  View,
  type TextInputProps as RNTextInputProps,
} from 'react-native';

import {
  formatMinor,
  formatTypedDisplay,
  getCurrencyDecimals,
  parseToMinor,
  sanitizeTyped,
} from '@/lib/fx/currency';
import { Brand, FontFamily, Neutral, Radius, Rhythm, Semantic, Type } from '@/constants/theme';

import { Text } from './text';

export type CurrencyInputProps = Omit<
  RNTextInputProps,
  'value' | 'onChangeText' | 'keyboardType' | 'inputMode' | 'style'
> & {
  /** Current value in minor units. `null` means empty/unset. */
  value: bigint | null;
  /** Fires with the parsed minor-unit value, or `null` when the field is empty. */
  onChangeMinor: (value: bigint | null) => void;
  /** ISO 4217 currency code — drives decimals, displayed as a trailing chip. */
  currency: string;
  /** Field label rendered above the input. */
  label?: string;
  /** Helper text below the input. Hidden when `error` is set. */
  helper?: string;
  /** Error text below the input. Triggers error styling. */
  error?: string;
};

/**
 * Numeric input for money. Stores `bigint` minor units; formats as you type
 * with group separators and currency-correct decimals (SGD/USD/EUR=2,
 * JPY/KRW=0, BHD/KWD=3). The currency code is shown as a trailing chip but
 * is set by the parent — switch the currency and the displayed value
 * re-formats with the new decimal count (truncating excess digits).
 */
export function CurrencyInput({
  value,
  onChangeMinor,
  currency,
  label,
  helper,
  error,
  editable = true,
  onFocus,
  onBlur,
  accessibilityLabel,
  placeholder,
  ...rest
}: CurrencyInputProps) {
  const decimals = useMemo(() => getCurrencyDecimals(currency), [currency]);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string>(() =>
    value === null ? '' : formatMinor(value, currency),
  );

  // When the parent changes value or currency externally, re-sync the draft
  // unless the user is actively typing (focused). This handles cases like
  // AI-extraction populating the field and currency-chip switches.
  useEffect(() => {
    if (focused) return;
    setDraft(value === null ? '' : formatMinor(value, currency));
  }, [value, currency, focused]);

  const hasError = Boolean(error);
  const borderColor = hasError
    ? Semantic.error.fg
    : focused
      ? Brand.interactive
      : Neutral.borderSubtle;

  const placeholderText = placeholder ?? (decimals === 0 ? '0' : '0.' + '0'.repeat(decimals));

  function handleChangeText(next: string) {
    const sanitized = sanitizeTyped(next, currency);
    setDraft(formatTypedDisplay(sanitized));
    if (sanitized === '' || sanitized === '-') {
      onChangeMinor(null);
      return;
    }
    const minor = parseToMinor(sanitized, currency);
    onChangeMinor(minor);
  }

  return (
    <View style={[styles.wrapper, !editable && styles.wrapperDisabled]}>
      {label ? (
        <Text variant="caption" color="textSecondary" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.inputWrap, { borderColor }]}>
        <RNTextInput
          {...rest}
          value={draft}
          onChangeText={handleChangeText}
          editable={editable}
          // Numeric on iOS, decimal pad on Android; web uses inputMode below.
          keyboardType={
            decimals === 0
              ? Platform.OS === 'ios'
                ? 'number-pad'
                : 'numeric'
              : Platform.OS === 'ios'
                ? 'decimal-pad'
                : 'numeric'
          }
          inputMode={decimals === 0 ? 'numeric' : 'decimal'}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            // Re-format on blur so trailing dots / partial fractions resolve
            // to the canonical display.
            if (value !== null) {
              setDraft(formatMinor(value, currency));
            } else {
              setDraft('');
            }
            onBlur?.(event);
          }}
          placeholder={placeholderText}
          placeholderTextColor={Neutral.textDisabled}
          accessibilityLabel={accessibilityLabel ?? label}
          aria-invalid={hasError ? true : undefined}
          maxFontSizeMultiplier={1.4}
          style={[styles.input, !editable && styles.inputDisabled]}
        />
        <View style={styles.currencyChip} aria-hidden>
          <Text variant="chip" color="textSecondary">
            {currency.toUpperCase()}
          </Text>
        </View>
      </View>
      {hasError ? (
        <Text variant="caption" color="errorFg" style={styles.helper}>
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" color="textSecondary" style={styles.helper}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 6,
  },
  wrapperDisabled: {
    opacity: 0.5,
  },
  label: {
    marginLeft: 2,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Neutral.surface,
    borderRadius: Radius.input,
    borderWidth: 1,
    minHeight: Rhythm.tapTargetMin,
    paddingRight: 8,
  },
  input: {
    ...Type.body,
    flex: 1,
    color: Neutral.textPrimary,
    fontFamily: FontFamily.sansRegular,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    textAlign: 'right',
  },
  inputDisabled: {
    color: Neutral.textDisabled,
  },
  currencyChip: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Neutral.canvas,
    borderWidth: 1,
    borderColor: Neutral.borderSubtle,
  },
  helper: {
    marginLeft: 2,
  },
});
