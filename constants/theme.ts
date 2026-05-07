// Design tokens for Evenly. Source of truth: docs/design-system.md.
// Any change here must match the spec; if the spec is wrong, update both.

import { Platform } from 'react-native';

// ─── Color ───────────────────────────────────────────────────────────────

export const Brand = {
  accent: '#8FC2FF',
  interactive: '#2457D6',
  interactivePressed: '#1C45AD',
  focusRing: '#B9D3FF',
  washBg: '#EEF5FF',
} as const;

// Category palette: every category has icon (saturated, used as accent dot),
// tint (pale, used as icon-tile background), and glyph (dark variant of the
// hue, used as the tile's icon color so it passes WCAG AA on the tint).
export const Category = {
  meals: { icon: '#F76B15', tint: '#FEEBDC', glyph: '#C24E00' },
  transport: { icon: '#0090FF', tint: '#DCEEFE', glyph: '#0059B8' },
  lodging: { icon: '#30A46C', tint: '#DDF3E4', glyph: '#1E7A43' },
  entertainment: { icon: '#D6409F', tint: '#FCE5F3', glyph: '#A62A78' },
  groceries: { icon: '#FFB224', tint: '#FEF0CD', glyph: '#A35A00' },
  other: { icon: '#8B8D98', tint: '#EDEEF0', glyph: '#5C616B' },
} as const;

export type CategoryKey = keyof typeof Category;

export const Neutral = {
  canvas: '#FAFBF8',
  surface: '#FFFFFF',
  surfaceRaised: 'rgba(255,255,255,0.72)',
  borderSubtle: '#E5E9EE',
  textPrimary: '#16233B',
  textSecondary: '#667085',
  textDisabled: '#98A2B3',
} as const;

// Semantic palette is intentionally separate from Category so banners / toasts
// can never be confused with content taxonomy (Codex review finding #4).
export const Semantic = {
  info: { fg: '#155EEF', bg: '#EAF2FF' },
  success: { fg: '#067647', bg: '#ECFDF3' },
  warning: { fg: '#B54708', bg: '#FFFAEB' },
  error: { fg: '#B42318', bg: '#FEF3F2' },
} as const;

// Hero register — single locked formula per design-system §3.5. Reused on
// every hero surface (home top card, saved-detail header). No improvisation.
export const Hero = {
  pageWashGradient: ['#F4F9FF', '#EEF5FF', '#FFFDF7'] as const,
  pageWashStops: [0, 0.54, 1] as const,
  accentGlow: 'rgba(143, 194, 255, 0.22)',
} as const;

// ─── Typography ──────────────────────────────────────────────────────────

// Font family names match the keys we register with expo-font in _layout.tsx.
// The current app still ships the existing local font packages; these act as
// stand-ins while we validate the layout and art direction of the mockups.
export const FontFamily = {
  sansRegular: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemiBold: 'Geist_600SemiBold',
  sansBold: 'Geist_700Bold',
  monoBold: 'GeistMono_700Bold',
} as const;

export const Type = {
  displayXl: {
    fontFamily: FontFamily.sansBold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.2,
  },
  display: {
    fontFamily: FontFamily.sansBold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 17,
    lineHeight: 24,
  },
  body: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 15,
    lineHeight: 22,
  },
  bodyStrong: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  // Inline money amounts — Geist Sans 15/500 with tabular-nums. Apply
  // `fontVariant: ['tabular-nums']` at the Text component level.
  amountInline: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    fontFamily: FontFamily.sansRegular,
    fontSize: 13,
    lineHeight: 18,
  },
  chip: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
} as const;

// ─── Space, radii, elevation ─────────────────────────────────────────────

export const Space = {
  '4': 4,
  '8': 8,
  '12': 12,
  '16': 16,
  '20': 20,
  '24': 24,
  '32': 32,
  '40': 40,
  '48': 48,
} as const;

export const Radius = {
  pill: 9999,
  card: 16,
  button: 12,
  input: 10,
  sheet: 20,
  tile: 12,
  thumbnail: 10,
} as const;

// Component rhythm tokens — concrete dimensions so implementation doesn't
// drift across screens (Codex review finding #12).
export const Rhythm = {
  screenPaddingMobile: 16,
  screenPaddingWeb: 24,
  listRowHeight: 72,
  formFieldGap: 12,
  sectionGap: 24,
  chipHeight: 32,
  chipHorizontalPadding: 12,
  iconLabelGap: 12,
  stickySaveBarHeight: 72,
  stickySaveBarMinSafeArea: 16,
  bottomContentPaddingWithStickyBar: 96,
  tapTargetMin: 44,
} as const;

// Three shadow tokens. Borders carry most structure; shadows are reserved.
export const Shadow = {
  xs: Platform.select({
    ios: {
      shadowColor: '#1A1625',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 2,
    },
    android: { elevation: 1 },
    default: {},
  }),
  sm: Platform.select({
    ios: {
      shadowColor: '#1A1625',
      shadowOpacity: 0.06,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 12,
    },
    android: { elevation: 4 },
    default: {},
  }),
  glass: Platform.select({
    ios: {
      shadowColor: '#8FC2FF',
      shadowOpacity: 0.22,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 24,
    },
    android: { elevation: 8 },
    default: {},
  }),
} as const;

// ─── Web focus styling ───────────────────────────────────────────────────

// Apply on every interactive element on web. Native focus comes from the
// platform; we don't override there.
export const WebFocusRing = {
  outline: `2px solid ${Brand.interactive}`,
  outlineOffset: 2,
} as const;

// ─── Theme aggregator ────────────────────────────────────────────────────

export const Theme = {
  brand: Brand,
  category: Category,
  neutral: Neutral,
  semantic: Semantic,
  hero: Hero,
  type: Type,
  fontFamily: FontFamily,
  space: Space,
  radius: Radius,
  rhythm: Rhythm,
  shadow: Shadow,
  webFocusRing: WebFocusRing,
} as const;

export type Theme = typeof Theme;

// Legacy exports — Expo starter components still reference Colors.light /
// Colors.dark. Bridged to the new tokens so nothing breaks during migration.
// Remove when no callers remain.
export const Colors = {
  light: {
    text: Neutral.textPrimary,
    background: Neutral.canvas,
    tint: Brand.interactive,
    icon: Neutral.textSecondary,
    tabIconDefault: Neutral.textSecondary,
    tabIconSelected: Brand.interactive,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: '#FFFFFF',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#FFFFFF',
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: FontFamily.sansRegular,
    serif: 'ui-serif',
    rounded: FontFamily.sansRegular,
    mono: FontFamily.monoBold,
  },
  default: {
    sans: FontFamily.sansRegular,
    serif: 'serif',
    rounded: FontFamily.sansRegular,
    mono: FontFamily.monoBold,
  },
  web: {
    sans: `${FontFamily.sansRegular}, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,
    serif: "Georgia, 'Times New Roman', serif",
    rounded: `${FontFamily.sansRegular}, system-ui, sans-serif`,
    mono: `${FontFamily.monoBold}, SFMono-Regular, Menlo, monospace`,
  },
});
