import { Text, View } from 'react-native';
import { theme } from '@/theme';

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: theme.spacing(4) }}>
      <Text style={{ ...theme.font.h2, color: theme.colors.text }}>Home</Text>
    </View>
  );
}
