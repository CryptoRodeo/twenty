import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PrimaryButton } from '@/components/PrimaryButton';
import { levelByOrder, nextLevelAfter } from '@/domain/levels';
import { useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

export default function LevelUpScreen() {
  const router = useRouter();
  const { order } = useLocalSearchParams<{ order: string }>();
  const clearLevelUp = useAppStore((s) => s.clearLevelUp);
  const level = levelByOrder(Number(order));
  const next = nextLevelAfter(level.order);

  return (
    <View
      style={{
        flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing(6),
        justifyContent: 'center', gap: theme.spacing(4),
      }}
    >
      <Text style={{ ...theme.font.h2, color: theme.colors.success, textAlign: 'center' }}>
        Level up
      </Text>
      <Text style={{ ...theme.font.h1, color: theme.colors.text, textAlign: 'center' }}>
        {`Level ${level.name}`}
      </Text>
      <Text style={{ ...theme.font.body, color: theme.colors.textDim, textAlign: 'center' }}>
        {`6-ct: ${level.targets.SIX_COUNT}   Navy: ${level.targets.NAVY_SEAL}`}
      </Text>
      <Text style={{ ...theme.font.body, color: theme.colors.textDim, textAlign: 'center' }}>
        {next
          ? `Next: ${next.name} — ${next.targets.SIX_COUNT} / ${next.targets.NAVY_SEAL}`
          : 'Program complete — keep re-confirming graduation every 30 days.'}
      </Text>
      <PrimaryButton
        label="Continue"
        accessibilityLabel="Continue"
        onPress={() => { clearLevelUp(); router.replace('/(tabs)'); }}
      />
    </View>
  );
}
