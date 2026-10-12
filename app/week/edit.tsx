import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { LANDMARK_DURATION_SEC, MOVEMENTS, MOVEMENT_LABEL } from '@/domain/levels';
import { hasDeferredDays } from '@/domain/planner';
import { DAY_NAMES, addDays, dayIndex, parseIsoDate, shortDateLabel, weekStartIso } from '@/domain/time';
import type { Movement, PlanDay } from '@/domain/types';
import { useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

type Choice = Movement | 'REST';

const CHOICES: Choice[] = ['REST', ...MOVEMENTS];
const SESSION_MIN = LANDMARK_DURATION_SEC / 60;

export default function WeekEditScreen() {
  const router = useRouter();
  const settings = useAppStore((s) => s.settings);
  const allPlanned = useAppStore((s) => s.planned);
  const setPlanDays = useAppStore((s) => s.setPlanDays);

  const [choices, setChoices] = useState<Choice[]>(() =>
    DAY_NAMES.map((_, d) => settings.planDays.find((p) => p.dayOfWeek === d)?.movement ?? 'REST'),
  );

  const planDays: PlanDay[] = [];
  choices.forEach((choice, dayOfWeek) => {
    if (choice !== 'REST') planDays.push({ dayOfWeek, movement: choice });
  });
  const now = new Date();
  const weekStart = weekStartIso(now);
  const thisWeek = allPlanned.filter((p) => p.weekStart === weekStart);
  // Past and logged days keep this week's slot; any change there starts next Monday.
  const newLayoutFrom = hasDeferredDays(thisWeek, planDays, dayIndex(now))
    ? shortDateLabel(addDays(parseIsoDate(weekStart), 7))
    : null;
  const planned = choices.filter((c): c is Movement => c !== 'REST');
  const minutes = planned.length * SESSION_MIN;
  const perMovement = MOVEMENTS.map((m) => planned.filter((c) => c === m).length);
  const unbalanced = perMovement[0] !== perMovement[1];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** A rejected save stays on screen with the choices intact and says why. */
  async function save(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setPlanDays(planDays);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: theme.spacing(4) }}
      style={{ backgroundColor: theme.colors.bg }}
    >
      <Card title="Weekly plan">
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(2) }}>
          {`${minutes} / ${settings.weeklyGoalMin} min planned`}
        </Text>
        {newLayoutFrom !== null && (
          <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>
            {`New layout starts ${newLayoutFrom}`}
          </Text>
        )}
        {unbalanced && (
          <Text style={{ ...theme.font.body, color: theme.colors.danger, marginTop: theme.spacing(2) }}>
            Unbalanced — the program splits the week evenly between the two movements.
          </Text>
        )}
      </Card>

      {DAY_NAMES.map((name, dayOfWeek) => (
        <Card key={name} title={name}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) }}>
            {CHOICES.map((choice) => {
              const label = choice === 'REST' ? 'Rest' : MOVEMENT_LABEL[choice];
              return (
                <Chip
                  key={choice}
                  label={label}
                  accessibilityLabel={`${name} ${label}`}
                  selected={choices[dayOfWeek] === choice}
                  onPress={() => setChoices((prev) => prev.map((c, i) => (i === dayOfWeek ? choice : c)))}
                />
              );
            })}
          </View>
        </Card>
      ))}

      {error !== null && (
        <Text accessibilityRole="alert" style={{ ...theme.font.body, color: theme.colors.danger, marginBottom: theme.spacing(3) }}>
          {`Could not save: ${error}`}
        </Text>
      )}
      <PrimaryButton label="Save" accessibilityLabel="Save week" disabled={busy} onPress={() => void save()} />
    </ScrollView>
  );
}
