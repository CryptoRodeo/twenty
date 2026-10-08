import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ZERO_BASELINE } from '@/domain/progression';
import HomeScreen from '../../app/(tabs)/index';

const mockPush = jest.fn();
let mockWeek: Record<string, unknown>;
let mockProgression: Record<string, unknown>;
let mockState: Record<string, unknown>;
const mockImportBaseline = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector(mockState),
  selectWeek: () => mockWeek,
  selectProgression: () => mockProgression,
}));

beforeEach(() => {
  mockPush.mockClear();
  mockImportBaseline.mockReset().mockResolvedValue(undefined);
  mockState = { baseline: ZERO_BASELINE, sessions: [], importBaseline: mockImportBaseline };
  mockWeek = {
    weekStart: '2026-10-05',
    minutesDone: 40,
    goalMin: 80,
    days: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
      dayOfWeek: d, letter: 'MTWTFSS'[d], movement: null, short: null,
      planned: null, done: false, isToday: d === 2, missed: false, isTestDay: false,
    })),
    byMovement: {
      SIX_COUNT: [{ id: 'a', dayOfWeek: 0, movement: 'SIX_COUNT', targetReps: 292, isTestDay: false, sessionId: 'x', weekStart: '2026-10-05' }],
      NAVY_SEAL: [{ id: 'b', dayOfWeek: 1, movement: 'NAVY_SEAL', targetReps: 130, isTestDay: false, weekStart: '2026-10-05' }],
    },
    planned: [],
  };
  mockProgression = {
    currentLevel: { order: 9, name: '4B' },
    nextLevel: { order: 10, name: 'Graduation' },
    graduated: false,
    daysUntilGraduationExpiry: null,
    nextTargets: {
      SIX_COUNT: { movement: 'SIX_COUNT', best: 300, target: 325, met: false, remaining: 25, ratio: 0.92 },
      NAVY_SEAL: { movement: 'NAVY_SEAL', best: 150, target: 150, met: true, remaining: 0, ratio: 1 },
    },
  };
});

describe('home screen', () => {
  it('shows the weekly time goal', () => {
    render(<HomeScreen />);
    expect(screen.getByText('40 / 80 min')).toBeTruthy();
  });

  it('lists each movement’s planned days with targets and completion', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Monday · 292')).toBeTruthy();
    expect(screen.getByLabelText('Monday 6-count done')).toBeTruthy();
    expect(screen.getByText('Tuesday · 130')).toBeTruthy();
  });

  it('shows Missed for a missed planned day and Landmark attempt for a test day', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 7, 7, 0)); // Wednesday
    const days = mockWeek.days as { missed: boolean }[];
    days[0]!.missed = true;
    const byMovement = mockWeek.byMovement as Record<string, { isTestDay: boolean }[]>;
    byMovement.NAVY_SEAL![0]!.isTestDay = true;
    render(<HomeScreen />);
    expect(screen.getAllByText('Missed')).toHaveLength(1);
    expect(screen.getAllByText('Landmark attempt')).toHaveLength(1);
    jest.useRealTimers();
  });

  it('renders the seven day circles', () => {
    render(<HomeScreen />);
    expect(screen.getAllByTestId(/^day-circle-/)).toHaveLength(7);
  });

  it('shows the current level and what it is working toward', () => {
    render(<HomeScreen />);
    expect(screen.getByText('CURRENT: LEVEL 4B')).toBeTruthy();
    expect(screen.getByText('Working toward Graduation')).toBeTruthy();
    expect(screen.getByText('Best 300 / 325')).toBeTruthy();
    expect(screen.getByText('Best 150 / 150')).toBeTruthy();
    expect(screen.getByText('Target reached')).toBeTruthy();
  });

  it('warns about graduation expiry when graduated', () => {
    mockProgression = { ...mockProgression, graduated: true, nextLevel: null, daysUntilGraduationExpiry: 12 };
    render(<HomeScreen />);
    expect(screen.getByText('Graduation expires in 12 days')).toBeTruthy();
  });

  it('shows "no level yet" before the first landmark', () => {
    mockProgression = { ...mockProgression, currentLevel: null, nextLevel: { order: 0, name: '1A' } };
    render(<HomeScreen />);
    expect(screen.getByText('CURRENT: NO LEVEL YET')).toBeTruthy();
  });

  it('opens Edit Week', () => {
    render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Edit week'));
    expect(mockPush).toHaveBeenCalledWith('/week/edit');
  });

  describe('import card', () => {
    it('is shown on a fresh store with the two actions', async () => {
      mockState = { baseline: null, sessions: [], importBaseline: mockImportBaseline };
      render(<HomeScreen />);
      expect(screen.getByText('Import existing progress')).toBeTruthy();
      fireEvent.press(screen.getByLabelText('Import'));
      expect(mockPush).toHaveBeenCalledWith('/onboarding/import');
      fireEvent.press(screen.getByLabelText('Not now'));
      await waitFor(() => expect(mockImportBaseline).toHaveBeenCalledWith(ZERO_BASELINE));
    });

    it('is hidden once a baseline exists', () => {
      render(<HomeScreen />);
      expect(screen.queryByText('Import existing progress')).toBeNull();
    });

    it('is hidden once a session exists', () => {
      mockState = { baseline: null, sessions: [{ id: 's' }], importBaseline: mockImportBaseline };
      render(<HomeScreen />);
      expect(screen.queryByText('Import existing progress')).toBeNull();
    });

    it('shows an error when Not now fails to save', async () => {
      mockState = { baseline: null, sessions: [], importBaseline: mockImportBaseline };
      mockImportBaseline.mockRejectedValue(new Error('disk full'));
      render(<HomeScreen />);
      fireEvent.press(screen.getByLabelText('Not now'));
      expect(await screen.findByText('Could not save: disk full')).toBeTruthy();
    });
  });
});
