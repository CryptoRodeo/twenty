import { Pressable, Text } from 'react-native';
import { theme } from '@/theme';

export interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  /** Defaults to `label`; set it when the visible text is ambiguous ("Start"). */
  accessibilityLabel?: string;
}

export function PrimaryButton({
  label, onPress, disabled = false, variant = 'primary', accessibilityLabel,
}: PrimaryButtonProps) {
  const bg =
    variant === 'primary' ? theme.colors.accent
    : variant === 'danger' ? theme.colors.danger
    : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        backgroundColor: bg,
        opacity: disabled ? 0.4 : 1,
        borderRadius: theme.radii.card,
        borderWidth: variant === 'ghost' ? 1 : 0,
        borderColor: theme.colors.border,
        paddingVertical: theme.spacing(4),
        alignItems: 'center',
      }}
    >
      <Text style={{ ...theme.font.h2, color: variant === 'ghost' ? theme.colors.text : theme.colors.bg }}>
        {label}
      </Text>
    </Pressable>
  );
}
