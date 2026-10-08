import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { LandmarkProgress } from '@/components/LandmarkProgress';
import { MovementBadge, movementColor } from '@/components/MovementBadge';
import { PrimaryButton } from '@/components/PrimaryButton';
import { LANDMARK_DURATION_SEC, MOVEMENTS, MOVEMENT_LABEL } from '@/domain/levels';
import { formatClock } from '@/domain/pacing';
import { DAY_NAMES, dayIndex, weekStartIso } from '@/domain/time';
import { selectNextPlan, selectProgression, useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

export default function TrainScreen() {
  const router = useRouter();
  const now = new Date();
  const plan = useAppStore((s) => selectNextPlan(s, now));
  const progression = useAppStore((s) => selectProgression(s, now));
  const planDays = useAppStore((s) => s.settings.planDays);
  const restDay = !planDays.some((d) => d === dayIndex(now));

  const isToday =
    plan !== null && plan.weekStart === weekStartIso(now) && plan.dayOfWeek === dayIndex(now);
  const planLine = plan
    ? `${MOVEMENT_LABEL[plan.movement]} • ${plan.targetReps} reps • ${formatClock(LANDMARK_DURATION_SEC)}`
    : '';

  return (
    <ScrollView
      contentContainerStyle={{ padding: theme.spacing(4) }}
      style={{ backgroundColor: theme.colors.bg }}
    >
      <Card title="Guided workout">
        {plan ? (
          <>
            <Text style={{ ...theme.font.h2, color: theme.colors.text, marginBottom: theme.spacing(2) }}>
              {isToday ? `Today's target: ${planLine}` : `Next: ${DAY_NAMES[plan.dayOfWeek]} • ${planLine}`}
            </Text>
            {plan.isTestDay && (
              <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(4) }}>
                Landmark attempt
              </Text>
            )}
            <PrimaryButton
              label="Start"
              accessibilityLabel="Start guided workout"
              onPress={() =>
                router.push({
                  pathname: '/timer/setup',
                  params: {
                    movement: plan.movement,
                    targetReps: String(plan.targetReps),
                    durationSec: String(LANDMARK_DURATION_SEC),
                    kind: 'GUIDED',
                    plannedId: plan.id,
                  },
                })
              }
            />
          </>
        ) : (
          <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>
            {restDay
              ? 'Rest day — nothing planned. Use the custom timer for an extra session.'
              : 'No workout planned yet. Use the custom timer for an extra session.'}
          </Text>
        )}
      </Card>

      <Card title="Custom timer">
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(4) }}>
          Any reps, any duration — for extra or missed sessions.
        </Text>
        <PrimaryButton
          label="Open"
          accessibilityLabel="Open custom timer"
          variant="ghost"
          onPress={() => router.push({ pathname: '/timer/setup', params: { kind: 'CUSTOM' } })}
        />
      </Card>

      <Text style={{ ...theme.font.h2, color: theme.colors.text, marginBottom: theme.spacing(3) }}>
        Next level targets
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: theme.spacing(3) }}>
        {MOVEMENTS.map((m) => {
          const p = progression.nextTargets[m];
          return (
            <View key={m} style={{ width: theme.spacing(65), marginRight: theme.spacing(3) }}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing(3), marginBottom: theme.spacing(3) }}>
                  <MovementBadge movement={m} />
                  <Text style={{ ...theme.font.h2, color: theme.colors.text }}>
                    {`${MOVEMENT_LABEL[m]} Landmark`}
                  </Text>
                </View>
                <Text style={{ ...theme.font.h1, color: movementColor(m), marginBottom: theme.spacing(2) }}>
                  {`${p.target} reps / ${formatClock(LANDMARK_DURATION_SEC)}`}
                </Text>
                <LandmarkProgress progress={p} />
              </Card>
            </View>
          );
        })}
      </ScrollView>

      <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>
        A valid 20-minute result can unlock a landmark.
      </Text>
    </ScrollView>
  );
}
