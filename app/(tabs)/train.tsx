import { Text, View } from 'react-native';
import { theme } from '@/theme';

export default function TrainScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing(4) }}>
      <Text style={{ ...theme.font.h2, color: theme.colors.text }}>Train</Text>
    </View>
  );
}
