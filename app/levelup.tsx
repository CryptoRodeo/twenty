import { Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PrimaryButton } from '@/components/PrimaryButton';
import { GRADUATION_VALID_DAYS, levelByOrder } from '@/domain/levels';
import { selectProgression, useAppStore } from '@/store/useAppStore';
import { theme } from '@/theme';

export default function LevelUpScreen() {
  const router = useRouter();
  const { order } = useLocalSearchParams<{ order: string }>();
  const clearLevelUp = useAppStore((s) => s.clearLevelUp);
  const level = levelByOrder(Number(order));
  // Honours the chosen target level, like Home's "Working toward".
  const next = useAppStore((s) => selectProgression(s, new Date()).nextLevel);

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
          : `Program complete — keep re-confirming graduation every ${GRADUATION_VALID_DAYS} days.`}
      </Text>
      <PrimaryButton
        label="Continue"
        accessibilityLabel="Continue"
        onPress={() => { clearLevelUp(); router.replace('/(tabs)'); }}
      />
    </View>
  );
}
