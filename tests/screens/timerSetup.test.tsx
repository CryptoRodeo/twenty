import { fireEvent, render, screen } from '@testing-library/react-native';
import TimerSetupScreen from '../../app/timer/setup';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({ settings: { countInSec: 10 }, planned: [], sessions: [], baseline: null }),
  selectNextPlan: () => null,
}));

const BASE = { movement: 'SIX_COUNT', targetReps: '292', durationSec: '1200', kind: 'GUIDED' };

beforeEach(() => {
  mockPush.mockClear();
  mockParams = { ...BASE };
});

describe('timer setup', () => {
  it('shows the computed pace to two decimals', () => {
    render(<TimerSetupScreen />);
    expect(screen.getByText('1 rep every 4.11 s')).toBeTruthy();
  });

  it('shows the duration as mm:ss', () => {
    render(<TimerSetupScreen />);
    expect(screen.getByText('20:00')).toBeTruthy();
  });

  it('recomputes the pace when reps change', () => {
    render(<TimerSetupScreen />);
    fireEvent.press(screen.getByLabelText('+ Target reps'));
    expect(screen.getByText('1 rep every 4.10 s')).toBeTruthy();
  });

  it('warns that a non-20-minute session cannot unlock a landmark', () => {
    render(<TimerSetupScreen />);
    fireEvent.press(screen.getByLabelText('− Duration'));
    expect(screen.getByText(/only a 20:00 session can unlock a landmark/i)).toBeTruthy();
  });

  it('starts the workout with the chosen settings', () => {
    render(<TimerSetupScreen />);
    fireEvent.press(screen.getByLabelText('Start workout'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/timer/run',
      params: BASE,
    });
  });

  it('forwards plannedId to the run screen when present', () => {
    mockParams = { ...BASE, plannedId: 'p-42' };
    render(<TimerSetupScreen />);
    fireEvent.press(screen.getByLabelText('Start workout'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/timer/run',
      params: { ...BASE, plannedId: 'p-42' },
    });
  });

  it('defaults to 100 reps when there are no params and no plan', () => {
    mockParams = {};
    render(<TimerSetupScreen />);
    expect(screen.getByDisplayValue('100')).toBeTruthy();
    expect(screen.getByText('1 rep every 12.00 s')).toBeTruthy();
  });

  it('lets the target be typed on the number pad', () => {
    render(<TimerSetupScreen />);
    const field = screen.getByLabelText('Target reps');
    expect(field.props.keyboardType).toBe('number-pad');
    fireEvent.changeText(field, '50');
    expect(screen.getByText('1 rep every 24.00 s')).toBeTruthy();
  });

  it('starts with a typed target without leaving the field', () => {
    render(<TimerSetupScreen />);
    fireEvent.changeText(screen.getByLabelText('Target reps'), '50');
    fireEvent.press(screen.getByLabelText('Start workout'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/timer/run',
      params: { ...BASE, targetReps: '50' },
    });
  });
});
