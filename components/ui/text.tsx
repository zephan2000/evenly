import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { Brand, Neutral, Semantic, Type } from '@/constants/theme';

export type TextVariant = keyof typeof Type;

export type TextColorToken =
  | 'textPrimary'
  | 'textSecondary'
  | 'textDisabled'
  | 'brandAccent'
  | 'brandInteractive'
  | 'infoFg'
  | 'successFg'
  | 'warningFg'
  | 'errorFg'
  | 'inverse';

const colorTokens: Record<TextColorToken, string> = {
  textPrimary: Neutral.textPrimary,
  textSecondary: Neutral.textSecondary,
  textDisabled: Neutral.textDisabled,
  brandAccent: Brand.accent,
  brandInteractive: Brand.interactive,
  infoFg: Semantic.info.fg,
  successFg: Semantic.success.fg,
  warningFg: Semantic.warning.fg,
  errorFg: Semantic.error.fg,
  inverse: '#FFFFFF',
};

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: TextColorToken;
  /** Apply tabular numerals — use on inline money amounts so columns align. */
  tabularNums?: boolean;
};

export function Text({
  variant = 'body',
  color = 'textPrimary',
  tabularNums = false,
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps) {
  const composed: TextStyle = {
    ...Type[variant],
    color: colorTokens[color],
    ...(tabularNums ? { fontVariant: ['tabular-nums'] } : null),
  };
  return (
    <RNText
      // Cap Dynamic Type at 140% so layouts don't break; design-system §4.2
      // requires support up to 120% minimum.
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? 1.4}
      {...rest}
      style={[composed, style]}
    />
  );
}
