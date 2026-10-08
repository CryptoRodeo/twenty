import { Pressable, Text, View } from 'react-native';
import { GRADUATION_ORDER, GRADUATION_VALID_DAYS, type Level } from '@/domain/levels';
import { theme } from '@/theme';

export type RoadmapStatus = 'COMPLETED' | 'CURRENT' | 'LOCKED';

export interface RoadmapRowProps {
  level: Level;
  status: RoadmapStatus;
  reachedAt: string | null;
  isLast: boolean;
  expiryWarning?: string;
  onPress?: () => void;
}

const STATUS_COLOR: Record<RoadmapStatus, string> = {
  COMPLETED: theme.colors.success,
  CURRENT: theme.colors.accent,
  LOCKED: theme.colors.border,
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
}

export function RoadmapRow({
  level, status, reachedAt, isLast, expiryWarning, onPress,
}: RoadmapRowProps) {
  const color = STATUS_COLOR[status];
  const statusText =
    status === 'COMPLETED'
      ? reachedAt ? `Completed ${shortDate(reachedAt)}` : 'Completed'
      : status === 'CURRENT' ? 'Current' : 'Locked';

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`Level ${level.name}, ${statusText}`}
      onPress={onPress}
      style={{ flexDirection: 'row' }}
    >
      {/* the vertical timeline: dot plus the connecting line */}
      <View style={{ width: 28, alignItems: 'center' }}>
        <View
          style={{
            width: 14, height: 14, borderRadius: theme.radii.pill,
            borderWidth: 2, borderColor: color,
            backgroundColor: status === 'LOCKED' ? 'transparent' : color,
          }}
        />
        {!isLast && <View style={{ flex: 1, width: 2, backgroundColor: theme.colors.border }} />}
      </View>

      <View style={{ flex: 1, paddingBottom: theme.spacing(6) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ ...theme.font.h2, color: theme.colors.text }}>{level.name}</Text>
          <Text style={{ ...theme.font.body, color }}>{statusText}</Text>
        </View>
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginTop: theme.spacing(1) }}>
          {`6-ct: ${level.targets.SIX_COUNT}   Navy: ${level.targets.NAVY_SEAL}`}
        </Text>

        {level.order === GRADUATION_ORDER && (
          <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginTop: theme.spacing(2) }}>
            {`Both landmarks in the same calendar week (Mon–Sun), re-confirmed every ${GRADUATION_VALID_DAYS} days.`}
          </Text>
        )}
        {expiryWarning !== undefined && (
          <Text style={{ ...theme.font.body, color: theme.colors.danger, marginTop: theme.spacing(2) }}>
            {expiryWarning}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
