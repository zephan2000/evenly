import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Brand, Neutral, Radius, Space, WebFocusRing } from '@/constants/theme';
import { Text, type TextColorToken, type TextVariant } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

type SizeSpec = {
  height: number;
  paddingHorizontal: number;
  textVariant: Extract<TextVariant, 'body' | 'subtitle'>;
};

const sizeMap: Record<ButtonSize, SizeSpec> = {
  sm: { height: 36, paddingHorizontal: 12, textVariant: 'body' },
  md: { height: 44, paddingHorizontal: 16, textVariant: 'subtitle' },
  lg: { height: 52, paddingHorizontal: 20, textVariant: 'subtitle' },
};

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /**
   * Optional leading affordance (icon, sparkle, badge). Rendered to the
   * left of the label with a fixed gap. Hidden while `loading` so the
   * spinner sits centered. Callers own the icon's color — typically
   * `#FFFFFF` for primary and `Brand.interactive` for secondary/ghost.
   */
  leading?: React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  leading,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;
  const sz = sizeMap[size];
  const textColor = textColorFor(variant);

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      role="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      style={({ pressed, focused }: { pressed: boolean; focused?: boolean }) => [
        styles.base,
        {
          height: sz.height,
          paddingHorizontal: sz.paddingHorizontal,
          alignSelf: fullWidth ? ('stretch' as const) : ('flex-start' as const),
        },
        variantStyles(variant, pressed, inactive),
        Platform.OS === 'web' && focused ? webFocusStyle : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={textColor === 'inverse' ? '#FFFFFF' : Brand.interactive}
        />
      ) : (
        <>
          {leading ? <View style={styles.leading}>{leading}</View> : null}
          <Text variant={sz.textVariant} color={textColor}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function variantStyles(variant: ButtonVariant, pressed: boolean, disabled: boolean): ViewStyle {
  const opacity = disabled ? 0.4 : 1;
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: pressed ? Brand.interactivePressed : Brand.interactive,
        opacity,
      };
    case 'secondary':
      return {
        backgroundColor: Neutral.surface,
        borderWidth: 1,
        borderColor: pressed ? Brand.interactive : Neutral.borderSubtle,
        opacity,
      };
    case 'ghost':
      return {
        backgroundColor: pressed ? Brand.washBg : 'transparent',
        opacity,
      };
  }
}

function textColorFor(variant: ButtonVariant): TextColorToken {
  return variant === 'primary' ? 'inverse' : 'brandInteractive';
}

// Web-only focus ring. `outline` / `outlineOffset` aren't in RN's ViewStyle
// shape but react-native-web forwards them straight to the DOM node, so we
// declare via an `as` boundary to keep TS happy.
const webFocusStyle = {
  outline: WebFocusRing.outline,
  outlineOffset: WebFocusRing.outlineOffset,
} as unknown as StyleProp<ViewStyle>;

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.button,
    minWidth: 44,
    gap: Space[8],
  },
  leading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
