import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { NumberField } from '@/components/NumberField';
import { LANDMARK_DURATION_SEC, MOVEMENT_LABEL } from '@/domain/levels';
import { formatClock } from '@/domain/pacing';
import type { Movement, SessionKind } from '@/domain/types';
import { selectProgression, useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

const EFFORT_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function TimerSummaryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    movement: string; targetReps: string; durationSec: string;
    kind: string; completedReps: string; startedAt: string; plannedId?: string;
  }>();
  const ready = useAppStore((s) => s.ready);
  const addSession = useAppStore((s) => s.addSession);
  const progression = useAppStore((s) => selectProgression(s, new Date()));

  const movement = params.movement as Movement;
  const durationSec = Number(params.durationSec);
  const targetReps = Number(params.targetReps);

  /** What the timer counted, assuming every paced rep was done. */
  const counted = Number(params.completedReps);
  const [confirmed, setConfirmed] = useState(true);
  const [enteredReps, setEnteredReps] = useState(counted);
  const completedReps = confirmed ? counted : enteredReps;
  const [effort, setEffort] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const landmark = progression.nextTargets[movement].target;
  const clearedLandmark =
    durationSec === LANDMARK_DURATION_SEC && completedReps >= landmark;

  async function save(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    try {
      await addSession({
        movement,
        startedAt: params.startedAt,
        durationSec,
        targetReps,
        completedReps,
        effort,
        kind: params.kind as SessionKind,
      }, params.plannedId);
      const reached = useAppStore.getState().pendingLevelUp;
      if (reached !== null) {
        router.replace({ pathname: '/levelup', params: { order: String(reached) } });
      } else {
        router.replace('/(tabs)');
      }
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: theme.spacing(4) }}
      style={{ backgroundColor: theme.colors.bg }}
    >
      <Card title={`${MOVEMENT_LABEL[movement]} • ${formatClock(durationSec)}`}>
        <Text style={{ ...theme.font.h1, color: theme.colors.text, marginBottom: theme.spacing(3) }}>
          {`You did ${counted} / ${targetReps}`}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), marginBottom: theme.spacing(3) }}>
          <Chip
            label="Yes, that's right"
            accessibilityLabel="Confirm timer count"
            selected={confirmed}
            onPress={() => setConfirmed(true)}
          />
          <Chip
            label="I did a different number"
            accessibilityLabel="Enter a different number"
            selected={!confirmed}
            onPress={() => setConfirmed(false)}
          />
        </View>
        {!confirmed && (
          <View style={{ alignItems: 'center', marginBottom: theme.spacing(3) }}>
            <NumberField
              value={enteredReps}
              onChange={setEnteredReps}
              accessibilityLabel="Completed reps"
              min={0}
            />
          </View>
        )}
        {clearedLandmark && (
          <Text style={{ ...theme.font.h2, color: theme.colors.success }}>
            Landmark cleared — {completedReps} / {landmark}
          </Text>
        )}
      </Card>

      <Card title="How hard was that?">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) }}>
          {EFFORT_SCALE.map((n) => (
            <Chip
              key={n}
              label={String(n)}
              accessibilityLabel={`Effort ${n}`}
              selected={effort === n}
              onPress={() => setEffort(n)}
            />
          ))}
        </View>
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginTop: theme.spacing(3) }}>
          Optional — it only tunes next week's target.
        </Text>
      </Card>

      <View style={{ gap: theme.spacing(3) }}>
        {saveError !== null && (
          <Text style={{ ...theme.font.body, color: theme.colors.danger }}>
            Could not save your workout: {saveError}. Your numbers are kept — try again.
          </Text>
        )}
        <PrimaryButton
          label="Save"
          accessibilityLabel="Save workout"
          disabled={saving || !ready}
          onPress={() => void save()}
        />
        <PrimaryButton
          label="Discard"
          accessibilityLabel="Discard workout"
          variant="ghost"
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </ScrollView>
  );
}
