import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from './text';

export type SectionHeaderProps = {
  title: string;
  trailing?: React.ReactNode;
};

export function SectionHeader({ title, trailing }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text variant="title">{title}</Text>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  trailing: {
    flexShrink: 0,
  },
});
