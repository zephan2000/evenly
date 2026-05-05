import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, type ButtonProps } from './button';
import { Text } from './text';

export type EmptyStateProps = {
  /** Optional illustration — emoji string or React node. Placeholder until
   *  proper artwork ships post-MVP (see design-system §12). */
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  cta?: Pick<ButtonProps, 'label' | 'onPress'>;
};

export function EmptyState({ illustration, title, description, cta }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {illustration ? <View style={styles.illustration}>{illustration}</View> : null}
      <Text variant="title" color="textPrimary" style={styles.center}>
        {title}
      </Text>
      {description ? (
        <Text variant="body" color="textSecondary" style={[styles.center, styles.description]}>
          {description}
        </Text>
      ) : null}
      {cta ? (
        <View style={styles.cta}>
          <Button label={cta.label} onPress={cta.onPress} size="md" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 12,
  },
  illustration: {
    marginBottom: 8,
  },
  center: {
    textAlign: 'center',
  },
  description: {
    maxWidth: 360,
  },
  cta: {
    marginTop: 16,
  },
});
