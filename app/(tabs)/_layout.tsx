import { Tabs } from 'expo-router';
import { type ColorValue, Text } from 'react-native';
import { theme } from '@/theme';

function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => (
    <Text style={{ color, fontSize: 18 }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bg },
        headerTintColor: theme.colors.text,
        headerTitle: 'Twenty',
        headerTitleAlign: 'left',
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
        },
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textDim,
        sceneStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="train" options={{ title: 'Train', tabBarIcon: icon('▶') }} />
      <Tabs.Screen name="levels" options={{ title: 'Levels', tabBarIcon: icon('≡') }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats', tabBarIcon: icon('◫') }} />
    </Tabs>
  );
}
