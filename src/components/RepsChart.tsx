import { Text, View } from 'react-native';
import type { ChartPoint } from '@/domain/stats';
import { theme } from '@/theme';

const CHART_HEIGHT = 160;
const LABEL_ROOM = 24;
const AXIS_LABEL_SIZE = 10;

export interface RepsChartProps {
  points: ChartPoint[];
  color: string;
  peak: number;
}

/**
 * A plain bar chart. Deliberately hand-rolled rather than pulled from a chart
 * library: the data is one short series of bars, and this keeps the bars
 * individually testable and the bundle small.
 */
export function RepsChart({ points, color, peak }: RepsChartProps) {
  if (points.length === 0) {
    return (
      <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>
        No workouts logged yet.
      </Text>
    );
  }

  const safePeak = peak > 0 ? peak : 1;

  return (
    <View>
      <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(2) }}>
        {`Peak: ${peak}`}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT, gap: theme.spacing(1) }}>
        {points.map((p) => (
          <View key={p.key} style={{ flex: 1, alignItems: 'center' }}>
            <View
              testID={`bar-${p.key}`}
              accessibilityLabel={`${p.label}: ${p.value} reps`}
              style={{
                width: '80%',
                height: Math.max(2, (p.value / safePeak) * (CHART_HEIGHT - LABEL_ROOM)),
                backgroundColor: color,
                borderTopLeftRadius: 4, borderTopRightRadius: 4,
              }}
            />
            <Text
              style={{
                ...theme.font.body, fontSize: AXIS_LABEL_SIZE,
                color: theme.colors.textDim, marginTop: theme.spacing(1),
              }}
            >
              {p.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
