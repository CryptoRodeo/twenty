import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { openAppDb } from '@/data/db';
import { runMigrations } from '@/data/migrations';
import { useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

export default function RootLayout() {
  const ready = useAppStore((s) => s.ready);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openAppDb();
        await runMigrations(db);
        if (cancelled) return;
        const store = useAppStore.getState();
        await store.init(db);
        // A fresh install must not persist a 1-rep week; wait for a baseline or history.
        const { baseline, sessions } = useAppStore.getState();
        if (baseline !== null || sessions.length > 0) await store.ensureWeek(new Date());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // A week can roll over while the app stays open; plan it when we come back.
  useEffect(() => {
    if (!ready) return undefined;
    const sub = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      const state = useAppStore.getState();
      if (state.baseline !== null || state.sessions.length > 0) {
        state.ensureWeek(new Date()).catch((e: unknown) =>
          setError(e instanceof Error ? e.message : String(e)));
      }
    });
    return () => sub.remove();
  }, [ready]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.bg },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: theme.colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      {(!ready || error !== null) && (
        <View style={styles.overlay} pointerEvents="auto">
          {error ? (
            <Text style={styles.error}>Could not open the database: {error}</Text>
          ) : (
            <ActivityIndicator color={theme.colors.accent} />
          )}
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
    padding: theme.spacing(6),
  },
  error: { color: theme.colors.danger, ...theme.font.body },
});
