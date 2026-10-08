import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { DayCircles } from '@/components/DayCircles';
import { LandmarkProgress } from '@/components/LandmarkProgress';
import { movementColor } from '@/components/MovementBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { MOVEMENTS, MOVEMENT_LABEL } from '@/domain/levels';
import { graduationWarning } from '@/domain/progression';
import { DAY_NAMES } from '@/domain/time';
import { selectProgression, selectWeek, useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const now = new Date();
  const week = useAppStore((s) => selectWeek(s, now));
  const progression = useAppStore((s) => selectProgression(s, now));
  const warning = graduationWarning(progression);

  return (
    <ScrollView
      contentContainerStyle={{ padding: theme.spacing(4) }}
      style={{ backgroundColor: theme.colors.bg }}
    >
      <Card
        title="This week's plan"
        right={
          <Pressable accessibilityRole="link" accessibilityLabel="Edit week" onPress={() => router.push('/week/edit')}>
            <Text style={{ ...theme.font.body, color: theme.colors.accent }}>Edit Week</Text>
          </Pressable>
        }
      >
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(1) }}>
          {`${week.minutesDone} / ${week.goalMin} min`}
        </Text>
        <ProgressBar value={week.minutesDone} max={week.goalMin} />

        <View style={{ flexDirection: 'row', gap: theme.spacing(4), marginTop: theme.spacing(4) }}>
          {MOVEMENTS.map((m) => (
            <View key={m} style={{ flex: 1 }}>
              <Text style={{ ...theme.font.body, color: movementColor(m), fontWeight: '700', marginBottom: theme.spacing(2) }}>
                {MOVEMENT_LABEL[m]}
              </Text>
              {week.byMovement[m].length === 0 ? (
                <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>Not planned</Text>
              ) : (
                week.byMovement[m].map((p) => (
                  <View key={p.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing(2), marginBottom: theme.spacing(1) }}>
                    <Text style={{ ...theme.font.body, color: theme.colors.text }}>
                      {`${DAY_NAMES[p.dayOfWeek]} · ${p.targetReps}`}
                    </Text>
                    {week.days[p.dayOfWeek]?.missed && (
                      <Text style={{ ...theme.font.body, color: theme.colors.danger }}>Missed</Text>
                    )}
                    {p.isTestDay && (
                      <Text style={{ ...theme.font.body, color: theme.colors.accent }}>Landmark attempt</Text>
                    )}
                    {p.sessionId !== undefined && (
                      <Text
                        accessibilityLabel={`${DAY_NAMES[p.dayOfWeek]} ${MOVEMENT_LABEL[m]} done`}
                        style={{ ...theme.font.body, color: theme.colors.success }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                ))
              )}
            </View>
          ))}
        </View>

        <View style={{ marginTop: theme.spacing(4) }}>
          <DayCircles days={week.days} />
        </View>
      </Card>

      <Card title={progression.nextLevel ? `Working toward ${progression.nextLevel.name}` : 'Graduated'}>
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(3) }}>
          {progression.currentLevel
            ? `CURRENT: LEVEL ${progression.currentLevel.name}`
            : 'CURRENT: NO LEVEL YET'}
        </Text>

        {warning !== null && (
          <Text style={{ ...theme.font.body, color: theme.colors.danger, marginBottom: theme.spacing(3) }}>
            {warning}
          </Text>
        )}

        {MOVEMENTS.map((m) => (
          <View key={m} style={{ marginBottom: theme.spacing(3) }}>
            <Text style={{ ...theme.font.body, color: movementColor(m), fontWeight: '700', marginBottom: theme.spacing(1) }}>
              {MOVEMENT_LABEL[m]}
            </Text>
            <LandmarkProgress progress={progression.nextTargets[m]} />
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
