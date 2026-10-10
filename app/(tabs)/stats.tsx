import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { movementColor } from '@/components/MovementBadge';
import { PrimaryButton } from '@/components/PrimaryButton';
import { RepsChart } from '@/components/RepsChart';
import { StatTile } from '@/components/StatTile';
import { Stepper } from '@/components/Stepper';
import { LANDMARK_DURATION_SEC, MOVEMENTS, MOVEMENT_LABEL } from '@/domain/levels';
import { formatClock } from '@/domain/pacing';
import { buildChartSeries, peakValue, type Bucket } from '@/domain/stats';
import type { Movement, Session } from '@/domain/types';
import { selectProgression, selectStats, useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

const BUCKETS: { bucket: Bucket; label: string }[] = [
  { bucket: 'WORKOUT', label: 'Workout' },
  { bucket: 'WEEK', label: 'Week' },
  { bucket: 'MONTH', label: 'Month' },
];

const CHART_LIMIT = 16;
const MAX_EFFORT = 10;

function withThousands(n: number): string {
  return n.toLocaleString('en-US');
}

function validEdit(reps: number, effort: number | null): boolean {
  return Number.isInteger(reps) && reps >= 0
    && (effort === null || (Number.isInteger(effort) && effort >= 1 && effort <= MAX_EFFORT));
}

function RecordRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing(2) }}>
      <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>{label}</Text>
      <Text style={{ ...theme.font.body, color: theme.colors.text, fontWeight: '700' }}>
        {withThousands(value)}
      </Text>
    </View>
  );
}

export default function StatsScreen() {
  const now = new Date();
  const sessions = useAppStore((s) => s.sessions);
  const editSession = useAppStore((s) => s.editSession);
  const removeSession = useAppStore((s) => s.removeSession);
  const stats = useAppStore((s) => selectStats(s, now));
  const progression = useAppStore((s) => selectProgression(s, now));

  const [bucket, setBucket] = useState<Bucket>('WORKOUT');
  const [movement, setMovement] = useState<Movement>('SIX_COUNT');
  const [editing, setEditing] = useState<Session | null>(null);
  const [draftReps, setDraftReps] = useState(0);
  const [draftEffort, setDraftEffort] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const points = useMemo(
    () => buildChartSeries({ sessions, movement, bucket, limit: CHART_LIMIT }),
    [sessions, movement, bucket],
  );
  const history = useMemo(
    () => [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [sessions],
  );

  function openEditor(session: Session): void {
    setEditing(session);
    setDraftReps(session.completedReps);
    setDraftEffort(session.effort);
    setConfirmingDelete(false);
    setError(null);
  }

  async function run(action: () => Promise<void>, failure: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(null);
    } catch (e) {
      setError(`${failure}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function save(): void {
    if (!editing) return;
    if (!validEdit(draftReps, draftEffort)) {
      setError('Reps must be a whole number of 0 or more, and effort 1–10 or not set.');
      return;
    }
    void run(() => editSession({ ...editing, completedReps: draftReps, effort: draftEffort }), 'Could not save changes');
  }

  function remove(): void {
    if (!editing) return;
    void run(() => removeSession(editing.id), 'Could not delete the session');
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: theme.spacing(4) }}
      style={{ backgroundColor: theme.colors.bg }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(3), marginBottom: theme.spacing(3) }}>
        <StatTile label="Current level" value={progression.currentLevel?.name ?? '—'} />
        <StatTile label="Total burpees" value={withThousands(stats.totals.total)} />
        <StatTile label="Workouts" value={withThousands(stats.totals.workouts)} />
        <StatTile label="Current streak" value={String(stats.streakWeeks)} hint="weeks" />
      </View>

      <Card title="Personal records">
        {MOVEMENTS.map((m) => (
          <RecordRow
            key={`best-${m}`}
            label={`Best ${MOVEMENT_LABEL[m]} in ${formatClock(LANDMARK_DURATION_SEC)}`}
            value={stats.records.best20Min[m]}
          />
        ))}
        {MOVEMENTS.map((m) => (
          <RecordRow
            key={`total-${m}`}
            label={m === 'SIX_COUNT' ? 'Total 6-counts' : 'Total Navy Seals'}
            value={stats.records.totalByMovement[m]}
          />
        ))}
      </Card>

      <Card title="Progress">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), marginBottom: theme.spacing(3) }}>
          {BUCKETS.map((b) => (
            <Chip
              key={b.bucket}
              label={b.label}
              accessibilityLabel={`Group by ${b.label}`}
              selected={bucket === b.bucket}
              onPress={() => setBucket(b.bucket)}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2), marginBottom: theme.spacing(4) }}>
          {MOVEMENTS.map((m) => (
            <Chip
              key={m}
              label={MOVEMENT_LABEL[m]}
              accessibilityLabel={`Chart ${MOVEMENT_LABEL[m]}`}
              selected={movement === m}
              onPress={() => setMovement(m)}
            />
          ))}
        </View>
        <RepsChart points={points} color={movementColor(movement)} peak={peakValue(points)} />
      </Card>

      <Card title="History">
        {history.length === 0 ? (
          <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>
            No workouts logged yet.
          </Text>
        ) : (
          history.map((s) => (
            <Pressable
              key={s.id}
              testID={`history-${s.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${MOVEMENT_LABEL[s.movement]} session`}
              onPress={() => openEditor(s)}
              style={{
                flexDirection: 'row', justifyContent: 'space-between',
                paddingVertical: theme.spacing(3),
                borderBottomWidth: 1, borderBottomColor: theme.colors.border,
              }}
            >
              <Text style={{ ...theme.font.body, color: theme.colors.text }}>
                {`${new Date(s.startedAt).toLocaleDateString()} · ${MOVEMENT_LABEL[s.movement]}`}
              </Text>
              <Text style={{ ...theme.font.body, color: movementColor(s.movement) }}>
                {`${s.completedReps} · ${formatClock(s.durationSec)}${s.effort === null ? '' : ` · E${s.effort}`}`}
              </Text>
            </Pressable>
          ))
        )}
      </Card>

      <Modal
        visible={editing !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setEditing(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: theme.colors.scrim }}
        >
          <View
            style={{
              backgroundColor: theme.colors.bg, padding: theme.spacing(4),
              borderTopLeftRadius: theme.radii.card, borderTopRightRadius: theme.radii.card,
            }}
          >
            <Text style={{ ...theme.font.h2, color: theme.colors.text, marginBottom: theme.spacing(4) }}>
              Edit session
            </Text>
            <Stepper label="Completed reps" value={draftReps} onChange={setDraftReps} min={0} />
            <Stepper
              label="Effort"
              value={draftEffort ?? 0}
              onChange={(n) => setDraftEffort(n === 0 ? null : n)}
              min={0}
              max={MAX_EFFORT}
              format={(n) => (n === 0 ? 'Not set' : String(n))}
            />
            {error !== null && (
              <Text
                accessibilityRole="alert"
                style={{ ...theme.font.body, color: theme.colors.danger, marginBottom: theme.spacing(3) }}
              >
                {error}
              </Text>
            )}
            <View style={{ gap: theme.spacing(3) }}>
              <PrimaryButton label="Save" accessibilityLabel="Save changes" disabled={busy} onPress={save} />
              {confirmingDelete ? (
                <PrimaryButton
                  label="Delete?"
                  accessibilityLabel="Confirm delete"
                  variant="danger"
                  disabled={busy}
                  onPress={remove}
                />
              ) : (
                <PrimaryButton
                  label="Delete"
                  accessibilityLabel="Delete session"
                  variant="danger"
                  disabled={busy}
                  onPress={() => setConfirmingDelete(true)}
                />
              )}
              <PrimaryButton
                label="Cancel"
                accessibilityLabel="Cancel edit"
                variant="ghost"
                onPress={() => setEditing(null)}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
