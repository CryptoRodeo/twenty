import { render, screen } from '@testing-library/react-native';
import { DayCircles } from '@/components/DayCircles';
import type { WeekDayView } from '@/store/useAppStore';

const day = (over: Partial<WeekDayView>): WeekDayView => ({
  dayOfWeek: 0, letter: 'M', movement: null, short: null,
  planned: null, done: false, isToday: false, missed: false, isTestDay: false, ...over,
});

const week: WeekDayView[] = [
  day({ dayOfWeek: 0, letter: 'M', movement: 'SIX_COUNT', short: '6', done: true }),
  day({ dayOfWeek: 1, letter: 'T', movement: 'NAVY_SEAL', short: 'N' }),
  day({ dayOfWeek: 2, letter: 'W', movement: 'NAVY_SEAL', short: 'N', isToday: true }),
  day({ dayOfWeek: 3, letter: 'T' }),
  day({ dayOfWeek: 4, letter: 'F' }),
  day({ dayOfWeek: 5, letter: 'S' }),
  day({ dayOfWeek: 6, letter: 'S', movement: 'SIX_COUNT', short: '6' }),
];

describe('DayCircles', () => {
  it('renders seven circles', () => {
    render(<DayCircles days={week} />);
    expect(screen.getAllByTestId(/^day-circle-/)).toHaveLength(7);
  });

  it('shows the movement letter on planned days and a dash on rest days', () => {
    render(<DayCircles days={week} />);
    expect(screen.getByTestId('day-circle-0').props.accessibilityLabel).toContain('6-count');
    expect(screen.getByTestId('day-circle-3').props.accessibilityLabel).toContain('Rest');
  });

  it('flags missed days in the label', () => {
    render(<DayCircles days={[day({ dayOfWeek: 0, movement: 'SIX_COUNT', short: '6', missed: true })]} />);
    expect(screen.getByTestId('day-circle-0').props.accessibilityLabel).toContain('missed');
  });

  it('marks completed days as done and flags today', () => {
    render(<DayCircles days={week} />);
    expect(screen.getByTestId('day-circle-0').props.accessibilityLabel).toContain('done');
    expect(screen.getByTestId('day-circle-2').props.accessibilityLabel).toContain('today');
  });
});
