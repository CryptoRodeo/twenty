import { Pressable, Text } from 'react-native';
import { theme } from '@/theme';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        paddingVertical: theme.spacing(2),
        paddingHorizontal: theme.spacing(4),
        borderRadius: theme.radii.pill,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accent : 'transparent',
      }}
    >
      <Text style={{ ...theme.font.body, color: selected ? theme.colors.bg : theme.colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}
