import { useState } from 'react';
import { ScrollView, Share, Switch, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Stepper } from '@/components/Stepper';
import { exportBackup } from '@/data/backup';
import { LANDMARK_DURATION_SEC, LEVELS } from '@/domain/levels';
import { useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

const GOAL_STEP_MIN = LANDMARK_DURATION_SEC / 60;

export default function SettingsScreen() {
  const router = useRouter();
  const ready = useAppStore((s) => s.ready);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setTargetLevel = useAppStore((s) => s.setTargetLevel);
  const db = useAppStore((s) => s.db);
  const restoreBackup = useAppStore((s) => s.restoreBackup);
  const [restoreJson, setRestoreJson] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(task: () => Promise<void>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, value: boolean, onChange: (v: boolean) => Promise<void>) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing(3) }}>
      <Text style={{ ...theme.font.body, color: theme.colors.text }}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={(v) => void run(() => onChange(v))} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: theme.spacing(4) }} style={{ backgroundColor: theme.colors.bg }}>
      {error !== null && (
        <Text accessibilityRole="alert" style={{ ...theme.font.body, color: theme.colors.danger, marginBottom: theme.spacing(3) }}>
          {error}
        </Text>
      )}
      {notice !== null && (
        <Text style={{ ...theme.font.body, color: theme.colors.success, marginBottom: theme.spacing(3) }}>
          {notice}
        </Text>
      )}

      <Card title="Level you're working on">
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginBottom: theme.spacing(3) }}>
          Choosing a level completes nothing. Reaching it later completes it and every level below.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing(2) }}>
          {LEVELS.map((level) => (
            <Chip
              key={level.order}
              label={level.name}
              accessibilityLabel={`Working level ${level.name}`}
              selected={settings.targetLevelOrder === level.order}
              onPress={() => {
                if (!ready || busy || level.order === settings.targetLevelOrder) return;
                void run(() => setTargetLevel(level.order));
              }}
            />
          ))}
        </View>
      </Card>

      <Card title="Workout cues">
        {row('Sound', settings.soundOn, (v) => updateSettings({ soundOn: v }))}
        {row('Haptics', settings.hapticsOn, (v) => updateSettings({ hapticsOn: v }))}
        <Stepper
          label="Count-in seconds"
          value={settings.countInSec}
          min={3}
          max={30}
          onChange={(n) => void run(() => updateSettings({ countInSec: n }))}
        />
      </Card>

      <Card title="Weekly goal">
        <Stepper
          label="Minutes per week"
          value={settings.weeklyGoalMin}
          step={GOAL_STEP_MIN}
          min={GOAL_STEP_MIN}
          max={300}
          onChange={(n) => void run(() => updateSettings({ weeklyGoalMin: n }))}
        />
      </Card>

      <Card title="Backup">
        <PrimaryButton
          label="Export JSON"
          accessibilityLabel="Export backup"
          disabled={busy || db === null}
          onPress={() => void run(async () => {
            if (!db) return;
            await Share.share({ message: await exportBackup(db, new Date()) });
          })}
        />
        <Text style={{ ...theme.font.body, color: theme.colors.textDim, marginVertical: theme.spacing(3) }}>
          Paste a backup below to restore. This replaces everything currently stored. The format is described under File formats in the README.
        </Text>
        <TextInput
          accessibilityLabel="Restore JSON"
          multiline
          value={restoreJson}
          onChangeText={(t) => { setRestoreJson(t); setConfirming(false); }}
          style={{
            ...theme.font.body, color: theme.colors.text, minHeight: 100,
            borderWidth: 1, borderColor: theme.colors.border,
            borderRadius: theme.radii.card, padding: theme.spacing(3), textAlignVertical: 'top',
          }}
        />
        <View style={{ marginTop: theme.spacing(3), gap: theme.spacing(3) }}>
          {confirming ? (
            <>
              <Text style={{ ...theme.font.body, color: theme.colors.danger }}>
                Replace all workouts, plans and settings with this backup? This cannot be undone.
              </Text>
              <PrimaryButton
                label="Yes, replace everything"
                accessibilityLabel="Confirm restore"
                variant="danger"
                disabled={busy}
                onPress={() => void run(async () => {
                  if (!db) return;
                  setConfirming(false);
                  await restoreBackup(restoreJson);
                  router.back();
                })}
              />
              <PrimaryButton
                label="Cancel"
                accessibilityLabel="Cancel restore"
                variant="ghost"
                onPress={() => setConfirming(false)}
              />
            </>
          ) : (
            <PrimaryButton
              label="Restore"
              accessibilityLabel="Restore backup"
              variant="danger"
              disabled={busy || db === null || restoreJson.trim() === ''}
              onPress={() => setConfirming(true)}
            />
          )}
        </View>
      </Card>

      <Card title="Progress import">
        <PrimaryButton
          label="Re-enter baseline"
          accessibilityLabel="Re-enter baseline"
          variant="ghost"
          onPress={() => router.push('/onboarding/import')}
        />
      </Card>
    </ScrollView>
  );
}
