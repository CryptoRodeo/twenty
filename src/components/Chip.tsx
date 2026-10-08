import { Pressable, Text } from 'react-native';
import { theme } from '@/theme';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Defaults to `label`; set it when the visible text is ambiguous ("9"). */
  accessibilityLabel?: string;
}

export function Chip({ label, selected, onPress, accessibilityLabel }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
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
