import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { createCuePlayer } from '@/audio/cuePlayer';
import type { PacingConfig } from '@/domain/pacing';
import { useAppStore } from '@/store/useAppStore';
import { createTimerRuntime, type TimerRuntime, type TimerSnapshot } from './runtime';

const TICK_MS = 50;

export interface TimerEngine {
  snapshot: TimerSnapshot;
  pause: () => void;
  resume: () => void;
  adjustReps: (delta: number) => void;
  endEarly: () => void;
}

export function useTimerEngine(
  config: PacingConfig,
  options: { onFinish: (snapshot: TimerSnapshot) => void },
): TimerEngine {
  useKeepAwake(); // the screen must stay on for the whole workout
  const settings = useAppStore((s) => s.settings);
  const runtimeRef = useRef<TimerRuntime | null>(null);
  const playerRef = useRef<ReturnType<typeof createCuePlayer> | null>(null);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(options.onFinish);
  onFinishRef.current = options.onFinish;

  if (runtimeRef.current === null) runtimeRef.current = createTimerRuntime(config, Date.now());

  const [snapshot, setSnapshot] = useState<TimerSnapshot>(() =>
    runtimeRef.current!.snapshot(Date.now()),
  );

  // Created in an effect so StrictMode / fast refresh never reuse a player
  // that cleanup has already removed.
  useEffect(() => {
    const player = createCuePlayer(settings);
    playerRef.current = player;
    return () => {
      player.unload();
      if (playerRef.current === player) playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (finishedRef.current) {
        clearInterval(id);
        return;
      }
      const result = runtimeRef.current!.tick(Date.now());
      for (const cue of result.audibleCues) playerRef.current?.play(cue.type);
      setSnapshot(result.snapshot);
      if (result.snapshot.status === 'FINISHED') {
        finishedRef.current = true;
        clearInterval(id);
        onFinishRef.current(result.snapshot);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Returning from the background recomputes position from timestamps.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setSnapshot(runtimeRef.current!.snapshot(Date.now()));
    });
    return () => sub.remove();
  }, []);

  return {
    snapshot,
    pause: useCallback(() => {
      runtimeRef.current!.pause(Date.now());
      setSnapshot(runtimeRef.current!.snapshot(Date.now()));
    }, []),
    resume: useCallback(() => {
      runtimeRef.current!.resume(Date.now());
      setSnapshot(runtimeRef.current!.snapshot(Date.now()));
    }, []),
    adjustReps: useCallback((delta: number) => {
      runtimeRef.current!.adjustReps(delta);
      setSnapshot(runtimeRef.current!.snapshot(Date.now()));
    }, []),
    endEarly: useCallback(() => {
      const final = runtimeRef.current!.end(Date.now());
      setSnapshot(final);
      if (!finishedRef.current) {
        finishedRef.current = true;
        onFinishRef.current(final);
      }
    }, []),
  };
}
