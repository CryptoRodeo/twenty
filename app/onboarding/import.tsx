import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { CSV_HEADER, parseSessionCsv } from '@/domain/csv';
import { LEVELS } from '@/domain/levels';
import { ZERO_BASELINE } from '@/domain/progression';
import type { Baseline } from '@/domain/types';
import { useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

function toCount(text: string): number {
  const n = Number(text.replace(/[^0-9]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const EMPTY_FIELDS = {
  bestSix: '', bestNavy: '', totalSix: '', totalNavy: '', workouts: '', streak: '',
};

export default function ImportScreen() {
  const router = useRouter();
  const importBaseline = useAppStore((s) => s.importBaseline);
  const importSessions = useAppStore((s) => s.importSessions);

  const [levelOrder, setLevelOrder] = useState<number | null>(null);
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [csv, setCsv] = useState('');
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lifetime = toCount(fields.totalSix) + toCount(fields.totalNavy);

  const numberField = (key: keyof typeof fields, label: string) => (
    <View style={{ marginBottom: theme.spacing(3) }}>
      <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(1) }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType="number-pad"
        value={fields[key]}
        onChangeText={(text) => setFields((prev) => ({ ...prev, [key]: text }))}
        style={{
          ...theme.font.h2, color: theme.colors.text,
          borderWidth: 1, borderColor: theme.colors.border,
          borderRadius: theme.radii.card, padding: theme.spacing(3),
        }}
      />
    </View>
  );

  /** Runs a save; a rejection stays on screen with the entered values intact. */
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setSaveError(null);
    try {
      await work();
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    const parsed = parseSessionCsv(csv);
    if (parsed.errors.length > 0) {
      setCsvErrors(parsed.errors);
      return;
    }
    const baseline: Baseline = {
      startLevelOrder: levelOrder,
      bestLandmark: { SIX_COUNT: toCount(fields.bestSix), NAVY_SEAL: toCount(fields.bestNavy) },
      totalReps: { SIX_COUNT: toCount(fields.totalSix), NAVY_SEAL: toCount(fields.totalNavy) },
      workouts: toCount(fields.workouts),
      streakWeeks: toCount(fields.streak),
      graduationWeekStart: null,
    };
    await run(async () => {
      await importBaseline(baseline);
      if (parsed.rows.length > 0) await importSessions(parsed.rows);
    });
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: theme.spacing(4) }}
      style={{ backgroundColor: theme.colors.bg }}
    >
      <Card title="Import existing progress">
        <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>
          Already training? Enter where you are. These numbers become a baseline that new
          workouts add on top of; training never changes them. Leave anything you do not know blank.
        </Text>
      </Card>

      <Card title="Current level">
        <Text accessibilityLabel="Current level" style={{ ...theme.font.h2, color: theme.colors.text, marginBottom: theme.spacing(3) }}>
          {levelOrder === null ? 'Not started' : LEVELS[levelOrder]!.name}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) }}>
          {LEVELS.map((level) => (
            <Chip
              key={level.order}
              label={level.name}
              accessibilityLabel={`Set level ${level.name}`}
              selected={levelOrder === level.order}
              onPress={() => setLevelOrder(level.order)}
            />
          ))}
        </View>
      </Card>

      <Card title="Personal bests and totals">
        {numberField('bestSix', 'Best 6-count in 20 minutes')}
        {numberField('bestNavy', 'Best Navy Seal in 20 minutes')}
        {numberField('totalSix', 'Total 6-counts')}
        {numberField('totalNavy', 'Total Navy Seals')}
        {numberField('workouts', 'Workouts')}
        {numberField('streak', 'Streak weeks')}
        <Text style={{ ...theme.font.h2, color: theme.colors.success }}>
          {`${lifetime.toLocaleString('en-US')} lifetime burpees`}
        </Text>
      </Card>

      <Card title="Past sessions (optional)">
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(2) }}>
          {`Paste CSV, one session per line: ${CSV_HEADER}`}
        </Text>
        <TextInput
          accessibilityLabel="Past sessions CSV"
          multiline
          value={csv}
          onChangeText={(text) => { setCsv(text); setCsvErrors([]); }}
          style={{
            ...theme.font.body, color: theme.colors.text, minHeight: 120,
            borderWidth: 1, borderColor: theme.colors.border,
            borderRadius: theme.radii.card, padding: theme.spacing(3),
            textAlignVertical: 'top',
          }}
        />
        {csvErrors.map((e) => (
          <Text key={e} style={{ ...theme.font.body, color: theme.colors.danger, marginTop: theme.spacing(1) }}>
            {e}
          </Text>
        ))}
      </Card>

      {saveError !== null && (
        <Text accessibilityRole="alert" style={{ ...theme.font.body, color: theme.colors.danger, marginBottom: theme.spacing(3) }}>
          {`Could not save: ${saveError}`}
        </Text>
      )}

      <View style={{ gap: theme.spacing(3) }}>
        <PrimaryButton label="Save" accessibilityLabel="Save imported progress" disabled={busy} onPress={() => void save()} />
        <PrimaryButton
          label="Skip"
          accessibilityLabel="Skip import"
          variant="ghost"
          disabled={busy}
          onPress={() => void run(() => importBaseline(ZERO_BASELINE))}
        />
      </View>
    </ScrollView>
  );
}
