import { Text, View } from 'react-native';
import { theme } from '@/theme';

export interface ProgressBarProps {
  value: number;
  max: number;
  color?: string;
  label?: string;
  testID?: string;
}

export function ProgressBar({ value, max, color, label, testID }: ProgressBarProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.max(0, Math.min(max, value));
  const pct = Math.round((clamped / safeMax) * 100);

  return (
    <View>
      {label !== undefined && (
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(1) }}>
          {label}
        </Text>
      )}
      <View
        testID={testID}
        accessibilityRole="progressbar"
        accessibilityValue={{ now: clamped, max }}
        style={{
          height: 10,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.border,
          overflow: 'hidden',
        }}
      >
        <View
          testID={testID === undefined ? undefined : `${testID}-fill`}
          style={{ width: `${pct}%`, height: '100%', backgroundColor: color ?? theme.colors.success }}
        />
      </View>
    </View>
  );
}
