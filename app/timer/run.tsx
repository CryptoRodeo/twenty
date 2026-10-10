import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PaceRing } from '@/components/PaceRing';
import { PrimaryButton } from '@/components/PrimaryButton';
import { movementColor } from '@/components/MovementBadge';
import { MOVEMENT_LABEL } from '@/domain/levels';
import type { Movement, SessionKind } from '@/domain/types';
import { useAppStore } from '@/store/useAppStore';
import { useTimerEngine } from '@/timer/useTimerEngine';
import type { TimerSnapshot } from '@/timer/runtime';
import { theme } from '@/theme';

export default function TimerRunScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    movement: string; targetReps: string; durationSec: string; kind: string; plannedId?: string;
  }>();
  const countInSec = useAppStore((s) => s.settings.countInSec);

  const movement = params.movement as Movement;
  const targetReps = Number(params.targetReps);
  const durationSec = Number(params.durationSec);
  const kind = params.kind as SessionKind;
  const plannedId = params.plannedId;
  // Captured once when the run starts, so the summary records the start, not the finish.
  const [startedAt] = useState(() => new Date().toISOString());

  const onFinish = useCallback(
    (snapshot: TimerSnapshot) => {
      router.replace({
        pathname: '/timer/summary',
        params: {
          movement, kind, startedAt,
          targetReps: String(targetReps),
          durationSec: String(durationSec),
          completedReps: String(snapshot.completedReps),
          ...(plannedId !== undefined ? { plannedId } : {}),
        },
      });
    },
    [router, movement, kind, startedAt, targetReps, durationSec, plannedId],
  );

  const engine = useTimerEngine({ durationSec, targetReps, countInSec }, { onFinish });
  const { snapshot } = engine;
  const color = movementColor(movement);
  const paused = snapshot.status === 'PAUSED';
  const countingIn = snapshot.status === 'COUNT_IN';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing(4), justifyContent: 'space-between' }}>
      <View style={{ alignItems: 'center', gap: theme.spacing(2) }}>
        <Text style={{ ...theme.font.h2, color: theme.colors.textDim }}>
          {MOVEMENT_LABEL[movement]}
        </Text>

        {countingIn ? (
          <>
            <Text style={{ ...theme.font.mono, color }}>{String(Math.ceil(-snapshot.elapsedSec))}</Text>
            <Text style={{ ...theme.font.h2, color: theme.colors.textDim }}>Get ready</Text>
          </>
        ) : (
          <Text style={{ ...theme.font.mono, color: theme.colors.text }}>{snapshot.clockLabel}</Text>
        )}
      </View>

      <View style={{ alignItems: 'center' }}>
        <PaceRing progress={snapshot.repProgress} color={color}>
          <Text style={{ ...theme.font.h1, color: theme.colors.text }}>
            {`${snapshot.completedReps} / ${targetReps}`}
          </Text>
        </PaceRing>
      </View>

      <View style={{ gap: theme.spacing(3) }}>
        <PrimaryButton
          label={paused ? 'Resume' : 'Pause'}
          accessibilityLabel={paused ? 'Resume' : 'Pause'}
          onPress={paused ? engine.resume : engine.pause}
        />
        <PrimaryButton
          label="End early"
          accessibilityLabel="End early"
          variant="ghost"
          onPress={engine.endEarly}
        />
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, textAlign: 'center' }}>
          Beeps pause while the app is in the background; your position catches up on return.
        </Text>
      </View>
    </View>
  );
}
