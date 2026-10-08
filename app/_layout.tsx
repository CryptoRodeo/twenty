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
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        return;
      }
      // Plan the week even on a fresh install; importing a baseline re-plans open slots.
      // Not fatal: the database is open, and planning is retried on the next foreground.
      try {
        await useAppStore.getState().ensureWeek(new Date());
      } catch (e) {
        console.warn('Could not plan the week', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // A week can roll over while the app stays open; plan it when we come back.
  useEffect(() => {
    if (!ready) return undefined;
    const sub = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;
      // Not fatal: the database is open, and planning is retried on the next foreground.
      useAppStore.getState().ensureWeek(new Date()).catch((e: unknown) => {
        console.warn('Could not plan the week', e);
      });
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
        <Stack.Screen name="levelup" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="onboarding/import" options={{ title: 'Import progress' }} />
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
