import { fireEvent, render, screen } from '@testing-library/react-native';
import TrainScreen from '../../app/(tabs)/train';

const mockPush = jest.fn();
let mockState: Record<string, unknown>;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector(mockState),
  selectNextPlan: () => mockState.nextPlan,
  selectProgression: () => mockState.progression,
  selectWeek: () => ({ planned: mockState.weekRows }),
}));

const PROGRESSION = {
  currentLevel: { order: 9, name: '4B' },
  nextLevel: { order: 10, name: 'Graduation' },
  nextTargets: {
    SIX_COUNT: { movement: 'SIX_COUNT', best: 300, target: 325, met: false, remaining: 25, ratio: 0.92 },
    NAVY_SEAL: { movement: 'NAVY_SEAL', best: 150, target: 150, met: true, remaining: 0, ratio: 1 },
  },
};

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 7, 9, 0) }); // Wednesday 2026-10-07
  mockPush.mockClear();
  mockState = {
    settings: { countInSec: 10 },
    weekRows: [{ id: 'x', dayOfWeek: 2 }],
    nextPlan: {
      id: '2026-10-05-2', weekStart: '2026-10-05', dayOfWeek: 2,
      movement: 'SIX_COUNT', targetReps: 292, isTestDay: false,
    },
    progression: PROGRESSION,
  };
});

afterEach(() => jest.useRealTimers());

describe('train screen', () => {
  it('shows today’s guided target', () => {
    render(<TrainScreen />);
    expect(screen.getByText("Today's target: 6-count • 292 reps • 20:00")).toBeTruthy();
  });

  it('labels a later-this-week plan with its day', () => {
    jest.setSystemTime(new Date(2026, 9, 5, 9, 0)); // Monday
    render(<TrainScreen />);
    expect(screen.getByText('Next: Wednesday • 6-count • 292 reps • 20:00')).toBeTruthy();
  });

  it('starts the guided workout pre-filled, including plannedId', () => {
    render(<TrainScreen />);
    fireEvent.press(screen.getByLabelText('Start guided workout'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/timer/setup',
      params: {
        movement: 'SIX_COUNT', targetReps: '292', durationSec: '1200',
        kind: 'GUIDED', plannedId: '2026-10-05-2',
      },
    });
  });

  it('labels a test day as a landmark attempt', () => {
    mockState.nextPlan = { ...(mockState.nextPlan as object), isTestDay: true, targetReps: 325 };
    render(<TrainScreen />);
    expect(screen.getByText(/landmark attempt/i)).toBeTruthy();
  });

  it('says rest day when this week has rows but none for today', () => {
    mockState.nextPlan = null;
    mockState.weekRows = [{ id: 'a', dayOfWeek: 0 }, { id: 'b', dayOfWeek: 6 }];
    render(<TrainScreen />);
    expect(screen.getByText(/rest day/i)).toBeTruthy();
  });

  it('says no workout planned yet when the week has no rows', () => {
    mockState.nextPlan = null;
    mockState.weekRows = [];
    render(<TrainScreen />);
    expect(screen.getByText(/no workout planned yet/i)).toBeTruthy();
    expect(screen.getByLabelText('Open custom timer')).toBeTruthy();
  });

  it('says done for today when today\'s slot is linked and nothing is later (Sunday)', () => {
    jest.setSystemTime(new Date(2026, 9, 11, 9, 0)); // Sunday
    mockState.nextPlan = null;
    mockState.weekRows = [{ id: 's', dayOfWeek: 6, sessionId: 'sess' }];
    render(<TrainScreen />);
    expect(screen.getByText(/done for today/i)).toBeTruthy();
    expect(screen.queryByText(/no workout planned/i)).toBeNull();
  });

  it('opens the custom timer with no prefilled plan', () => {
    render(<TrainScreen />);
    fireEvent.press(screen.getByLabelText('Open custom timer'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/timer/setup', params: { kind: 'CUSTOM' } });
  });

  it('shows a landmark card per movement with the current best', () => {
    render(<TrainScreen />);
    expect(screen.getByText('6-count Landmark')).toBeTruthy();
    expect(screen.getByText('325 reps / 20:00')).toBeTruthy();
    expect(screen.getByText('Best 300 / 325')).toBeTruthy();
  });

  it('badges a movement whose landmark is already met', () => {
    render(<TrainScreen />);
    expect(screen.getAllByText('Target reached')).toHaveLength(1);
  });

  it('explains the 20-minute rule', () => {
    render(<TrainScreen />);
    expect(screen.getByText(/valid 20-minute result can unlock a landmark/i)).toBeTruthy();
  });
});
