import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { DayCircles } from '@/components/DayCircles';
import { LandmarkProgress } from '@/components/LandmarkProgress';
import { movementColor } from '@/components/MovementBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { PrimaryButton } from '@/components/PrimaryButton';
import { LEVELS, MOVEMENTS, MOVEMENT_LABEL } from '@/domain/levels';
import { ZERO_BASELINE, graduationWarning } from '@/domain/progression';
import { DAY_NAMES } from '@/domain/time';
import { selectProgression, selectWeek, useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

export default function HomeScreen() {
  const router = useRouter();
  const now = new Date();
  const week = useAppStore((s) => selectWeek(s, now));
  const progression = useAppStore((s) => selectProgression(s, now));
  const warning = graduationWarning(progression);
  const showImport = useAppStore((s) => s.baseline === null && s.sessions.length === 0);
  const importBaseline = useAppStore((s) => s.importBaseline);
  const setTargetLevel = useAppStore((s) => s.setTargetLevel);
  const savedTarget = useAppStore((s) => s.settings.targetLevelOrder);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const chosen = selected ?? savedTarget;

  async function startAtLevel(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setStartError(null);
    try {
      await setTargetLevel(chosen);
      await importBaseline(ZERO_BASELINE);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: theme.spacing(4) }}
      style={{ backgroundColor: theme.colors.bg }}
    >
      {showImport && (
        <Card title="Choose your starting level">
          <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(3) }}>
            Pick the level you are working on. Choosing a level completes nothing. You can change this later in Settings.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), marginBottom: theme.spacing(3) }}>
            {LEVELS.map((level) => (
              <Chip
                key={level.order}
                label={level.name}
                accessibilityLabel={`Start level ${level.name}`}
                selected={chosen === level.order}
                onPress={() => setSelected(level.order)}
              />
            ))}
          </View>
          {startError !== null && (
            <Text accessibilityRole="alert" style={{ ...theme.font.body, color: theme.colors.danger, marginBottom: theme.spacing(3) }}>
              {`Could not save: ${startError}`}
            </Text>
          )}
          <View style={{ gap: theme.spacing(3) }}>
            <PrimaryButton
              label={`Start at ${LEVELS[chosen]!.name}`}
              accessibilityLabel="Start at selected level"
              disabled={busy}
              onPress={() => void startAtLevel()}
            />
            <PrimaryButton
              label="Import existing progress"
              variant="ghost"
              disabled={busy}
              onPress={() => router.push('/onboarding/import')}
            />
          </View>
        </Card>
      )}
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
