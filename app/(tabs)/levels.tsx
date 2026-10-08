import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/Card';
import { LandmarkProgress } from '@/components/LandmarkProgress';
import { movementColor } from '@/components/MovementBadge';
import { RoadmapRow, type RoadmapStatus } from '@/components/RoadmapRow';
import { GRADUATION_ORDER, LEVELS, MOVEMENTS, MOVEMENT_LABEL } from '@/domain/levels';
import { graduationWarning } from '@/domain/progression';
import { selectProgression, useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

const ROW_HEIGHT = 96;

export default function LevelsScreen() {
  const router = useRouter();
  const progression = useAppStore((s) => selectProgression(s, new Date()));
  const scrollRef = useRef<ScrollView>(null);
  const warning = graduationWarning(progression);
  const current = progression.currentLevelOrder;

  // Auto-scroll to the current level so the roadmap opens where the user is.
  useEffect(() => {
    if (current === null) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, (current - 1) * ROW_HEIGHT), animated: false });
  }, [current]);

  function statusFor(order: number): RoadmapStatus {
    if (current === null) return 'LOCKED';
    if (order < current) return 'COMPLETED';
    if (order === current) return 'CURRENT';
    return 'LOCKED';
  }

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={{ padding: theme.spacing(4) }}
      style={{ backgroundColor: theme.colors.bg }}
    >
      <Card
        title={progression.currentLevel ? `Level ${progression.currentLevel.name}` : 'No level yet'}
        right={
          <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>
            {progression.nextLevel ? `Working toward ${progression.nextLevel.name}` : 'Program complete'}
          </Text>
        }
      >
        {MOVEMENTS.map((m) => {
          const p = progression.nextTargets[m];
          return (
            <View key={m} style={{ marginBottom: theme.spacing(3) }}>
              <Text style={{ ...theme.font.body, color: movementColor(m), fontWeight: '700', marginBottom: theme.spacing(1) }}>
                {MOVEMENT_LABEL[m]}
              </Text>
              <LandmarkProgress progress={p} />
            </View>
          );
        })}

        {progression.currentLevel && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="View more about this level"
            onPress={() => router.push(`/levels/${progression.currentLevel!.order}`)}
          >
            <Text style={{ ...theme.font.body, color: theme.colors.accent }}>View more</Text>
          </Pressable>
        )}
      </Card>

      <Text style={{ ...theme.font.h2, color: theme.colors.text, marginBottom: theme.spacing(4) }}>
        Program roadmap
      </Text>

      {LEVELS.map((level, i) => (
        <RoadmapRow
          key={level.order}
          level={level}
          status={statusFor(level.order)}
          reachedAt={progression.reachedAt[level.order] ?? null}
          isLast={i === LEVELS.length - 1}
          {...(level.order === GRADUATION_ORDER && warning !== null ? { expiryWarning: warning } : {})}
          onPress={() => router.push(`/levels/${level.order}`)}
        />
      ))}
    </ScrollView>
  );
}
