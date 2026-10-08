import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/Card';
import { movementColor } from '@/components/MovementBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { GRADUATION_ORDER, GRADUATION_VALID_DAYS, LANDMARK_DURATION_SEC, MOVEMENTS, MOVEMENT_LABEL, levelByOrder } from '@/domain/levels';
import { formatClock } from '@/domain/pacing';
import { isLandmarkEligible } from '@/domain/progression';
import { selectProgression, useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

export default function LevelDetailScreen() {
  const { order } = useLocalSearchParams<{ order: string }>();
  const level = levelByOrder(Number(order));
  const now = new Date();
  const progression = useAppStore((s) => selectProgression(s, now));
  const sessions = useAppStore((s) => s.sessions);
  const reachedAt = progression.reachedAt[level.order];

  return (
    <ScrollView
      contentContainerStyle={{ padding: theme.spacing(4) }}
      style={{ backgroundColor: theme.colors.bg }}
    >
      <Card title={`Level ${level.name}`}>
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(3) }}>
          {reachedAt ? `Reached ${new Date(reachedAt).toLocaleDateString()}` : 'Not reached yet'}
        </Text>
        {MOVEMENTS.map((m) => (
          <View key={m} style={{ marginBottom: theme.spacing(3) }}>
            <ProgressBar
              value={progression.best[m]}
              max={level.targets[m]}
              color={movementColor(m)}
              label={`${MOVEMENT_LABEL[m]} ${progression.best[m]}/${level.targets[m]} in ${formatClock(LANDMARK_DURATION_SEC)}`}
            />
          </View>
        ))}
        {level.order === GRADUATION_ORDER && (
          <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>
            {`Both landmarks must land in the same calendar week (Mon–Sun), and graduation must be re-confirmed every ${GRADUATION_VALID_DAYS} days or the level drops back to 4B.`}
          </Text>
        )}
      </Card>

      <Card title="Best attempts">
        {MOVEMENTS.map((m) => {
          const best = sessions
            .filter((s) => s.movement === m && isLandmarkEligible(s))
            .sort((a, b) => b.completedReps - a.completedReps)
            .slice(0, 3);
          return (
            <View key={m} style={{ marginBottom: theme.spacing(4) }}>
              <Text style={{ ...theme.font.body, color: movementColor(m), fontWeight: '700' }}>
                {MOVEMENT_LABEL[m]}
              </Text>
              {best.length === 0 ? (
                <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>
                  No 20-minute attempts logged yet.
                </Text>
              ) : (
                best.map((s) => (
                  <Text key={s.id} style={{ ...theme.font.body, color: theme.colors.text }}>
                    {`${s.completedReps} reps · ${new Date(s.startedAt).toLocaleDateString()}`}
                  </Text>
                ))
              )}
            </View>
          );
        })}
      </Card>
    </ScrollView>
  );
}
