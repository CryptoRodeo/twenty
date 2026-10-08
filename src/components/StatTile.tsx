import { Text, View } from 'react-native';
import { theme } from '@/theme';

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View
      style={{
        flex: 1, minWidth: '45%',
        backgroundColor: theme.colors.card,
        borderColor: theme.colors.border, borderWidth: 1,
        borderRadius: theme.radii.card, padding: theme.spacing(4),
      }}
    >
      <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>{label}</Text>
      <Text style={{ ...theme.font.h1, color: theme.colors.text, marginTop: theme.spacing(1) }}>
        {value}
      </Text>
      {hint !== undefined && (
        <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>{hint}</Text>
      )}
    </View>
  );
}
