import { Pressable, Text, View } from 'react-native';
import { theme } from '@/theme';

export interface StepperProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  format?: (value: number) => string;
}

export function Stepper({
  label, value, onChange, step = 1, min = 1, max = Number.MAX_SAFE_INTEGER, format,
}: StepperProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const button = (text: string, delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${text} ${label}`}
      onPress={() => onChange(clamp(value + delta))}
      style={{
        width: 48, height: 48, borderRadius: theme.radii.card,
        borderWidth: 1, borderColor: theme.colors.border,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Text style={{ ...theme.font.h2, color: theme.colors.text }}>{text}</Text>
    </Pressable>
  );

  return (
    <View style={{ marginBottom: theme.spacing(4) }}>
      <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(2) }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {button('−', -step)}
        <Text style={{ ...theme.font.h1, color: theme.colors.text }}>
          {format ? format(value) : String(value)}
        </Text>
        {button('+', step)}
      </View>
    </View>
  );
}
