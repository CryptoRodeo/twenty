import { Text, View } from 'react-native';
import { movementColor } from '@/components/MovementBadge';
import { MOVEMENT_LABEL } from '@/domain/levels';
import { DAY_NAMES } from '@/domain/time';
import type { WeekDayView } from '@/store/useAppStore';
import { theme } from '@/theme';

function label(day: WeekDayView): string {
  const what = day.movement ? MOVEMENT_LABEL[day.movement] : 'Rest';
  const parts = [DAY_NAMES[day.dayOfWeek], what];
  if (day.done) parts.push('done');
  if (day.missed) parts.push('missed');
  if (day.isToday) parts.push('today');
  return parts.join(', ');
}

export function DayCircles({ days }: { days: WeekDayView[] }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {days.map((day) => {
        const color = day.movement ? movementColor(day.movement) : theme.colors.border;
        return (
          <View key={day.dayOfWeek} style={{ alignItems: 'center', gap: theme.spacing(1) }}>
            <Text style={{ ...theme.font.body, color: theme.colors.textDim }}>{day.letter}</Text>
            <View
              testID={`day-circle-${day.dayOfWeek}`}
              accessibilityLabel={label(day)}
              style={{
                width: theme.spacing(9), height: theme.spacing(9), borderRadius: theme.radii.pill,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: day.isToday ? 2 : 1,
                borderColor: day.isToday ? theme.colors.text : day.missed ? theme.colors.danger : color,
                backgroundColor: day.done ? color : 'transparent',
              }}
            >
              <Text
                style={{
                  ...theme.font.body,
                  fontWeight: '700',
                  color: day.done ? theme.colors.bg : day.movement ? color : theme.colors.textDim,
                }}
              >
                {day.short ?? '–'}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
