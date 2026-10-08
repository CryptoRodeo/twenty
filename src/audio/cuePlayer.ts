import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import type { CueType } from '@/domain/pacing';
import type { Settings } from '@/domain/types';

export interface CuePlayer {
  play(type: CueType): void;
  unload(): void;
}

const SOURCES = {
  beep: require('../../assets/sounds/beep.wav'),
  beepHigh: require('../../assets/sounds/beep-high.wav'),
  end: require('../../assets/sounds/end.wav'),
} as const;

/**
 * Plays the short cue sounds and taps the haptic motor, honouring the user's
 * sound/haptics switches. Players are created once and replayed by seeking to
 * zero — creating one per beep would never keep up at 4 reps/second.
 */
export function createCuePlayer(settings: Settings): CuePlayer {
  const players: Record<keyof typeof SOURCES, AudioPlayer> = {
    beep: createAudioPlayer(SOURCES.beep),
    beepHigh: createAudioPlayer(SOURCES.beepHigh),
    end: createAudioPlayer(SOURCES.end),
  };

  // Keep cues audible when the ringer switch is silent — this is a workout app.
  void setAudioModeAsync({ playsInSilentMode: true, shouldRouteThroughEarpiece: false });

  function fire(key: keyof typeof SOURCES): void {
    if (!settings.soundOn) return;
    const player = players[key];
    void player.seekTo(0).catch(() => {});
    player.play();
  }

  return {
    play(type) {
      switch (type) {
        case 'COUNT_IN':
          fire('beep');
          break;
        case 'REP':
          fire('beep');
          if (settings.hapticsOn) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case 'FINAL_MINUTE':
          fire('beepHigh');
          if (settings.hapticsOn) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          break;
        case 'END':
          fire('end');
          if (settings.hapticsOn) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
      }
    },
    unload() {
      for (const player of Object.values(players)) player.remove();
    },
  };
}
