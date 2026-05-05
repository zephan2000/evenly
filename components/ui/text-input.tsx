import React, { useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput as RNTextInput,
  View,
  type TextInputProps as RNTextInputProps,
} from 'react-native';

import { Brand, FontFamily, Neutral, Radius, Rhythm, Semantic, Type } from '@/constants/theme';
import { Text } from './text';

export type TextInputProps = Omit<RNTextInputProps, 'style'> & {
  label?: string;
  /** Helper text below the input. Hidden when `error` is set. */
  helper?: string;
  /** Error text below the input. Triggers error styling. */
  error?: string;
  /** Multi-line input. Grows up to 6 visible rows. */
  multiline?: boolean;
};

export function TextInput({
  label,
  helper,
  error,
  multiline = false,
  editable = true,
  onFocus,
  onBlur,
  accessibilityLabel,
  ...rest
}: TextInputProps) {
  const [focused, setFocused] = useState(false);
  const hasError = Boolean(error);

  const borderColor = hasError
    ? Semantic.error.fg
    : focused
      ? Brand.interactive
      : Neutral.borderSubtle;

  return (
    <View style={[styles.wrapper, !editable && styles.wrapperDisabled]}>
      {label ? (
        <Text variant="caption" color="textSecondary" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View style={[styles.inputWrap, { borderColor }, multiline && styles.inputWrapMultiline]}>
        <RNTextInput
          {...rest}
          editable={editable}
          multiline={multiline}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          accessibilityLabel={accessibilityLabel ?? label}
          aria-invalid={hasError ? true : undefined}
          placeholderTextColor={Neutral.textDisabled}
          maxFontSizeMultiplier={1.4}
          style={[
            styles.input,
            multiline && styles.inputMultiline,
            !editable && styles.inputDisabled,
          ]}
        />
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
    backgroundColor: Neutral.surface,
    borderRadius: Radius.input,
    borderWidth: 1,
    minHeight: Rhythm.tapTargetMin,
    justifyContent: 'center',
  },
  inputWrapMultiline: {
    minHeight: 88,
  },
  input: {
    ...Type.body,
    color: Neutral.textPrimary,
    fontFamily: FontFamily.sansRegular,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
  },
  inputMultiline: {
    paddingVertical: 12,
    textAlignVertical: 'top',
    minHeight: 88,
  },
  inputDisabled: {
    color: Neutral.textDisabled,
  },
  helper: {
    marginLeft: 2,
  },
});
