import { act, fireEvent, render, screen } from '@testing-library/react-native';
import TimerRunScreen from '../../app/timer/run';
import type { TimerSnapshot } from '@/timer/runtime';

const mockReplace = jest.fn();
let mockOptions: { onFinish: (s: TimerSnapshot) => void } | null = null;
const mockEngine = {
  snapshot: {
    status: 'RUNNING', elapsedSec: 44, remainingSec: 1156, clockLabel: '19:16',
    dueReps: 12, completedReps: 12, repProgress: 0.5, onPaceDelta: 0,
  } as TimerSnapshot,
  pause: jest.fn(), resume: jest.fn(), adjustReps: jest.fn(), endEarly: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({
    movement: 'SIX_COUNT', targetReps: '292', durationSec: '1200', kind: 'GUIDED', plannedId: 'p1',
  }),
}));
jest.mock('@/timer/useTimerEngine', () => ({
  useTimerEngine: (_config: unknown, options: { onFinish: (s: TimerSnapshot) => void }) => {
    mockOptions = options;
    return mockEngine;
  },
}));

const base = { ...mockEngine.snapshot };

beforeEach(() => {
  jest.clearAllMocks();
  mockEngine.snapshot = { ...base };
});

describe('timer run screen', () => {
  it('shows the remaining clock and the rep counter', () => {
    render(<TimerRunScreen />);
    expect(screen.getByText('19:16')).toBeTruthy();
    expect(screen.getByText('12 / 292')).toBeTruthy();
  });

  it('says you are on pace when the delta is zero, and shows the expected reps', () => {
    render(<TimerRunScreen />);
    expect(screen.getByText('On pace')).toBeTruthy();
    expect(screen.getByText('Expected 12')).toBeTruthy();
  });

  it('reports being ahead and behind', () => {
    mockEngine.snapshot = { ...base, onPaceDelta: 3 };
    const ahead = render(<TimerRunScreen />);
    expect(ahead.getByText('3 ahead')).toBeTruthy();
    ahead.unmount();
    mockEngine.snapshot = { ...base, onPaceDelta: -2 };
    const behind = render(<TimerRunScreen />);
    expect(behind.getByText('2 behind')).toBeTruthy();
  });

  it('wires pause and the manual corrections', () => {
    render(<TimerRunScreen />);
    fireEvent.press(screen.getByLabelText('Pause'));
    expect(mockEngine.pause).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Add one rep'));
    expect(mockEngine.adjustReps).toHaveBeenCalledWith(1);
    fireEvent.press(screen.getByLabelText('Remove one rep'));
    expect(mockEngine.adjustReps).toHaveBeenCalledWith(-1);
  });

  it('shows Resume while paused', () => {
    mockEngine.snapshot = { ...base, status: 'PAUSED' };
    render(<TimerRunScreen />);
    fireEvent.press(screen.getByLabelText('Resume'));
    expect(mockEngine.resume).toHaveBeenCalled();
  });

  it('counts the count-in down instead of showing the workout clock', () => {
    mockEngine.snapshot = { ...base, status: 'COUNT_IN', elapsedSec: -3.4 };
    render(<TimerRunScreen />);
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText(/get ready/i)).toBeTruthy();
  });

  it('notes the background limitation', () => {
    render(<TimerRunScreen />);
    expect(screen.getByText(/background/i)).toBeTruthy();
  });

  it('ends early straight to the summary with the run params', () => {
    mockEngine.endEarly.mockImplementation(() => mockOptions!.onFinish(base));
    render(<TimerRunScreen />);
    fireEvent.press(screen.getByLabelText('End early'));
    expect(mockEngine.endEarly).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/timer/summary',
      params: expect.objectContaining({
        movement: 'SIX_COUNT', kind: 'GUIDED', targetReps: '292', durationSec: '1200',
        completedReps: '12', plannedId: 'p1',
      }),
    });
  });

  it('passes the workout start time, not the finish time, to the summary', () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-03-02T07:00:00.000Z'));
      render(<TimerRunScreen />);
      jest.setSystemTime(new Date('2026-03-02T07:20:00.000Z'));
      act(() => mockOptions!.onFinish(base));
      expect(mockReplace.mock.calls[0][0].params.startedAt).toBe('2026-03-02T07:00:00.000Z');
    } finally {
      jest.useRealTimers();
    }
  });
});
