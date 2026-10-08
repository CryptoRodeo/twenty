import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Stepper } from '@/components/Stepper';
import { LANDMARK_DURATION_SEC, MOVEMENT_LABEL, MOVEMENTS } from '@/domain/levels';
import { formatClock, intervalSec } from '@/domain/pacing';
import type { Movement, SessionKind } from '@/domain/types';
import { selectNextPlan, useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

/** UI default for a custom workout with no plan; not a level target. */
const DEFAULT_CUSTOM_REPS = 100;
const MIN_DURATION_SEC = 60;
const DURATION_STEP_SEC = 60;

export default function TimerSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    movement?: string; targetReps?: string; durationSec?: string; kind?: string; plannedId?: string;
  }>();
  const fallback = useAppStore((s) => selectNextPlan(s, new Date()));

  const [movement, setMovement] = useState<Movement>(
    (params.movement as Movement | undefined) ?? fallback?.movement ?? 'SIX_COUNT',
  );
  const [targetReps, setTargetReps] = useState<number>(
    Number(params.targetReps ?? fallback?.targetReps ?? DEFAULT_CUSTOM_REPS),
  );
  const [durationSec, setDurationSec] = useState<number>(
    Number(params.durationSec ?? LANDMARK_DURATION_SEC),
  );
  const kind = (params.kind as SessionKind | undefined) ?? 'CUSTOM';

  const isLandmarkWindow = durationSec === LANDMARK_DURATION_SEC;
  const pace = intervalSec({ durationSec, targetReps, countInSec: 0 });

  return (
    <ScrollView
      contentContainerStyle={{ padding: theme.spacing(4) }}
      style={{ backgroundColor: theme.colors.bg }}
    >
      <Card title="Movement">
        <View style={{ flexDirection: 'row', gap: theme.spacing(3) }}>
          {MOVEMENTS.map((m) => (
            <Chip
              key={m}
              label={MOVEMENT_LABEL[m]}
              selected={m === movement}
              onPress={() => setMovement(m)}
            />
          ))}
        </View>
      </Card>

      <Card title="Workout">
        <Stepper label="Target reps" value={targetReps} onChange={setTargetReps} min={1} />
        <Stepper
          label="Duration"
          value={durationSec}
          onChange={setDurationSec}
          step={DURATION_STEP_SEC}
          min={MIN_DURATION_SEC}
          format={formatClock}
        />
        <Text style={{ ...theme.font.h2, color: theme.colors.accent }}>
          {`1 rep every ${pace.toFixed(2)} s`}
        </Text>
        {!isLandmarkWindow && (
          <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginTop: theme.spacing(2) }}>
            {`This counts toward your stats, but only a ${formatClock(LANDMARK_DURATION_SEC)} session can unlock a landmark.`}
          </Text>
        )}
      </Card>

      <PrimaryButton
        label="Start"
        accessibilityLabel="Start workout"
        onPress={() =>
          router.push({
            pathname: '/timer/run',
            params: {
              movement,
              targetReps: String(targetReps),
              durationSec: String(durationSec),
              kind,
              ...(params.plannedId !== undefined ? { plannedId: params.plannedId } : {}),
            },
          })
        }
      />
    </ScrollView>
  );
}
