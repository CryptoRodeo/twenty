import { Text, View } from 'react-native';
import { MOVEMENT_SHORT } from '@/domain/levels';
import type { Movement } from '@/domain/types';
import { theme } from '@/theme';

export function movementColor(movement: Movement): string {
  return movement === 'SIX_COUNT' ? theme.colors.sixCount : theme.colors.navySeal;
}

export function MovementBadge({ movement, size = 28 }: { movement: Movement; size?: number }) {
  return (
    <View
      accessibilityLabel={movement}
      style={{
        width: size, height: size, borderRadius: theme.radii.pill,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: movementColor(movement),
      }}
    >
      <Text style={{ color: theme.colors.bg, fontWeight: '700', fontSize: size * 0.5 }}>
        {MOVEMENT_SHORT[movement]}
      </Text>
    </View>
  );
}
