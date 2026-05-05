import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, type DimensionValue } from 'react-native';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  /** Shorthand for width: '100%'. */
  fullWidth?: boolean;
};

export function Skeleton({ width, height = 16, radius = 8, fullWidth = false }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      accessible={false}
      style={[
        styles.base,
        {
          width: fullWidth ? '100%' : width,
          height,
          borderRadius: radius,
          opacity,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    // Between borderSubtle (#E9E7EE) and surfaceRaised; reads as a calm
    // placeholder against the canvas without being noisy.
    backgroundColor: '#EEEDF1',
  },
});
