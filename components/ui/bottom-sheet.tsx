import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
  type BottomSheetModalProps,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';

import { Neutral, Radius, Shadow, Space } from '@/constants/theme';

import { Text } from './text';

export type BottomSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

export type BottomSheetProps = {
  /** Optional title rendered inside the sheet header. */
  title?: string;
  /**
   * Snap points as percentages or fixed heights. Defaults to ['50%']. Pass a
   * single string for a fixed half-sheet, or multiple values for a draggable
   * range (e.g. ['25%', '50%', '90%']).
   */
  snapPoints?: BottomSheetModalProps['snapPoints'];
  /** Allow the sheet to size to its content. Overrides `snapPoints`. */
  enableDynamicSizing?: boolean;
  /** Sheet body. */
  children: React.ReactNode;
  /** Fires when the sheet finishes closing (after dismissal animation). */
  onDismiss?: () => void;
  /** Padding around the body content. Defaults to 16pt. */
  contentPadding?: number;
  /** Style hook for the inner content wrapper (rare — prefer composition). */
  contentStyle?: ViewStyle;
};

const DEFAULT_SNAP_POINTS = ['50%'];

const Backdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop
    {...props}
    appearsOnIndex={0}
    disappearsOnIndex={-1}
    pressBehavior="close"
    opacity={0.5}
  />
);

/**
 * Half-sheet modal wrapper around `@gorhom/bottom-sheet`. Imperative API:
 *
 *   const sheetRef = useRef<BottomSheetHandle>(null);
 *   sheetRef.current?.present();
 *   sheetRef.current?.dismiss();
 *
 * Mount the sheet anywhere in the tree — the `BottomSheetModalProvider` in
 * `app/_layout.tsx` portals it to the top.
 *
 * For inputs inside a sheet, import `BottomSheetTextInput` from
 * `@gorhom/bottom-sheet` directly to avoid keyboard glitches; do not nest
 * our own `<TextInput>`.
 */
export const BottomSheet = forwardRef<BottomSheetHandle, BottomSheetProps>(function BottomSheet(
  {
    title,
    snapPoints,
    enableDynamicSizing = false,
    children,
    onDismiss,
    contentPadding = Space[16],
    contentStyle,
  },
  ref,
) {
  const sheetRef = useRef<BottomSheetModal>(null);

  const resolvedSnapPoints = useMemo(() => snapPoints ?? DEFAULT_SNAP_POINTS, [snapPoints]);

  const present = useCallback(() => sheetRef.current?.present(), []);
  const dismiss = useCallback(() => sheetRef.current?.dismiss(), []);

  useImperativeHandle(ref, () => ({ present, dismiss }), [present, dismiss]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={enableDynamicSizing ? undefined : resolvedSnapPoints}
      enableDynamicSizing={enableDynamicSizing}
      enablePanDownToClose
      onDismiss={onDismiss}
      backdropComponent={Backdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
      style={styles.shadow}
    >
      <BottomSheetView
        style={StyleSheet.flatten([styles.content, { padding: contentPadding }, contentStyle])}
      >
        {title ? (
          <Text variant="title" style={styles.title}>
            {title}
          </Text>
        ) : null}
        {children}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  background: {
    backgroundColor: Neutral.surface,
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
  },
  handle: {
    backgroundColor: Neutral.borderSubtle,
    width: 36,
    height: 4,
    borderRadius: 999,
  },
  shadow: {
    ...Shadow.sm,
  },
  content: {
    gap: Space[12],
  },
  title: {
    marginBottom: Space[4],
  },
});
