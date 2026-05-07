import { Image, type ImageSource } from 'expo-image';
import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Hero, Neutral, Shadow } from '@/constants/theme';
import { Card } from './card';
import { Text } from './text';

export type EditorialHeroProps = {
  imageSource: ImageSource;
  metaLeft: string;
  metaCenter: string;
  metaRight: string;
  headline: string;
  subtitle: string;
  headlineStyle?: StyleProp<TextStyle>;
  footer?: React.ReactNode;
  minHeight?: number;
};

export function EditorialHero({
  imageSource,
  metaLeft,
  metaCenter,
  metaRight,
  headline,
  subtitle,
  headlineStyle,
  footer,
  minHeight = 320,
}: EditorialHeroProps) {
  return (
    <View style={styles.shell}>
      <View style={styles.glow} />
      <Card padding={0} raised style={[styles.card, { minHeight }]}>
        <Image source={imageSource} style={styles.image} contentFit="cover" />
        <View style={styles.overlay} />
        <View style={styles.content}>
          <View style={styles.metaRow}>
            <Text variant="caption" style={styles.metaText}>
              {metaLeft}
            </Text>
            <Text variant="caption" style={styles.metaText}>
              {metaCenter}
            </Text>
            <Text variant="caption" style={styles.metaText}>
              {metaRight}
            </Text>
          </View>
          <View style={styles.copy}>
            <Text variant="displayXl" style={[styles.headline, headlineStyle]}>
              {headline}
            </Text>
            <Text variant="subtitle" style={styles.subtitle}>
              {subtitle}
            </Text>
          </View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
  },
  glow: {
    position: 'absolute',
    top: 18,
    left: 32,
    right: 32,
    bottom: -8,
    borderRadius: 28,
    backgroundColor: Hero.accentGlow,
    ...(Shadow.glass as ViewStyle),
  },
  card: {
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: '#DDEEFF',
    borderColor: 'rgba(255,255,255,0.6)',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 39, 82, 0.20)',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
    gap: 20,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaText: {
    color: 'rgba(255,255,255,0.92)',
    textTransform: 'lowercase',
  },
  copy: {
    gap: 12,
  },
  headline: {
    fontSize: 58,
    lineHeight: 52,
    letterSpacing: -2.6,
    maxWidth: 260,
    textTransform: 'lowercase',
    color: '#FFFFFF',
  },
  subtitle: {
    maxWidth: 260,
    color: 'rgba(255,255,255,0.92)',
  },
  footer: {
    gap: 12,
  },
});
