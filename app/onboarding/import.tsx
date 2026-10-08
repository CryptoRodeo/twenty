import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

const CSV_EXAMPLE_ROW = '2026-09-01,6-count,20,100,7';

const EMPTY_FIELDS = {
  bestSix: '', bestNavy: '', totalSix: '', totalNavy: '', workouts: '', streak: '',
};

/** Edit mode starts from what is stored, so saving one change never wipes the rest. */
function fieldsFrom(b: Baseline): typeof EMPTY_FIELDS {
  return {
    bestSix: String(b.bestLandmark.SIX_COUNT),
    bestNavy: String(b.bestLandmark.NAVY_SEAL),
    totalSix: String(b.totalReps.SIX_COUNT),
    totalNavy: String(b.totalReps.NAVY_SEAL),
    workouts: String(b.workouts),
    streak: String(b.streakWeeks),
  };
}

function skippedMessage(n: number): string {
  return n === 1 ? '1 duplicate row skipped' : `${n} duplicate rows skipped`;
}

export default function ImportScreen() {
  const router = useRouter();
  // Settings > "Re-enter baseline" opens this screen with mode=edit.
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const editing = mode === 'edit';
  const importBaseline = useAppStore((s) => s.importBaseline);
  const importSessions = useAppStore((s) => s.importSessions);
  const setTargetLevel = useAppStore((s) => s.setTargetLevel);
  const storedBaseline = useAppStore((s) => s.baseline);
  const storedTarget = useAppStore((s) => s.settings.targetLevelOrder);

  const [levelOrder, setLevelOrder] = useState<number | null>(() => (editing ? storedTarget : null));
  const [fields, setFields] = useState(() =>
    (editing && storedBaseline ? fieldsFrom(storedBaseline) : EMPTY_FIELDS));
  const [csv, setCsv] = useState('');
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  /**
   * Runs a save; a rejection stays on screen with the entered values intact.
   * A save that has something to report (`work` returns a message) stays on
   * screen to show it; otherwise it goes back.
   */
  async function run(work: () => Promise<string | null | void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setSaveError(null);
    setNotice(null);
    try {
      const message = await work();
      if (typeof message === 'string') {
        setNotice(message);
        setCsv('');
      } else {
        router.back();
      }
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
    // Fields this form does not show are kept from the stored baseline when editing.
    const kept = editing ? storedBaseline : null;
    const baseline: Baseline = {
      startLevelOrder: kept?.startLevelOrder ?? null,
      bestLandmark: { SIX_COUNT: toCount(fields.bestSix), NAVY_SEAL: toCount(fields.bestNavy) },
      totalReps: { SIX_COUNT: toCount(fields.totalSix), NAVY_SEAL: toCount(fields.totalNavy) },
      workouts: toCount(fields.workouts),
      streakWeeks: toCount(fields.streak),
      graduationWeekStart: kept?.graduationWeekStart ?? null,
    };
    await run(async () => {
      await importBaseline(baseline);
      const result = parsed.rows.length > 0 ? await importSessions(parsed.rows) : null;
      // The level choice goes last so nothing after it re-plans this week's targets.
      if (levelOrder !== null) await setTargetLevel(levelOrder);
      return result !== null && result.skipped > 0
        ? `Saved. ${result.imported} imported, ${skippedMessage(result.skipped)}.`
        : null;
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

      <Card title="Level you're working on">
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(3) }}>
          Choosing a level completes nothing; reach its landmarks in a 20-minute session to complete it.
        </Text>
        <Text accessibilityLabel="Level you're working on" style={{ ...theme.font.h2, color: theme.colors.text, marginBottom: theme.spacing(3) }}>
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
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(2) }}>
          {`Example: ${CSV_EXAMPLE_ROW}`}
        </Text>
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(2) }}>
          Rows are added to your history. A row identical to a stored session (same date, movement, duration and reps) is skipped.
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

      {notice !== null && (
        <Text accessibilityRole="alert" style={{ ...theme.font.body, color: theme.colors.success, marginBottom: theme.spacing(3) }}>
          {notice}
        </Text>
      )}

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
          // Editing an existing baseline: Skip leaves it untouched and writes nothing.
          onPress={() => (editing ? router.back() : void run(() => importBaseline(ZERO_BASELINE)))}
        />
      </View>
    </ScrollView>
  );
}
