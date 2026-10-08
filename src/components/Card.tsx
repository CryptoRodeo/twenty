import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { theme } from '@/theme';

export interface CardProps {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
}

export function Card({ title, right, children }: CardProps) {
  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: theme.radii.card,
        padding: theme.spacing(4),
        marginBottom: theme.spacing(3),
      }}
    >
      {(title !== undefined || right !== undefined) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: theme.spacing(3) }}>
          {title !== undefined && (
            <Text style={{ ...theme.font.h2, color: theme.colors.text }}>{title}</Text>
          )}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}
