import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ZERO_BASELINE } from '@/domain/progression';
import HomeScreen from '../../app/(tabs)/index';

const mockPush = jest.fn();
let mockWeek: Record<string, unknown>;
let mockProgression: Record<string, unknown>;
let mockState: Record<string, unknown>;
const mockImportBaseline = jest.fn();
const mockSetTargetLevel = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector(mockState),
  selectWeek: () => mockWeek,
  selectProgression: () => mockProgression,
}));

const freshState = (over: Record<string, unknown> = {}) => ({
  baseline: null, sessions: [], settings: { targetLevelOrder: 0 },
  importBaseline: mockImportBaseline, setTargetLevel: mockSetTargetLevel, ...over,
});

beforeEach(() => {
  mockPush.mockClear();
  mockImportBaseline.mockReset().mockResolvedValue(undefined);
  mockSetTargetLevel.mockReset().mockResolvedValue(undefined);
  mockState = freshState({ baseline: ZERO_BASELINE });
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
    newLayoutFrom: null,
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

  it('says when an edited layout starts, only while part of it waits for next week', () => {
    render(<HomeScreen />);
    expect(screen.queryByText(/New layout starts/)).toBeNull();
    mockWeek = { ...mockWeek, newLayoutFrom: '2026-10-12' };
    render(<HomeScreen />);
    expect(screen.getByText('New layout starts Mon 12 Oct')).toBeTruthy();
  });

  it('opens Edit Week', () => {
    render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Edit week'));
    expect(mockPush).toHaveBeenCalledWith('/week/edit');
  });

  it('opens Settings', () => {
    render(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Settings'));
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  describe('starting level card', () => {
    it('is shown on a fresh store with 1A selected', () => {
      mockState = freshState();
      render(<HomeScreen />);
      expect(screen.getByText('Choose your starting level')).toBeTruthy();
      expect(screen.getByText('Start at 1A')).toBeTruthy();
      expect(screen.getByText(/change this later in Settings/)).toBeTruthy();
    });

    it('choosing 1C and confirming saves the zero baseline then sets the target last', async () => {
      mockState = freshState();
      render(<HomeScreen />);
      fireEvent.press(screen.getByLabelText('Start level 1C'));
      fireEvent.press(screen.getByLabelText('Start at selected level'));
      await waitFor(() => expect(mockSetTargetLevel).toHaveBeenCalledWith(2));
      expect(mockImportBaseline).toHaveBeenCalledWith(ZERO_BASELINE);
      expect(mockImportBaseline.mock.invocationCallOrder[0]!)
        .toBeLessThan(mockSetTargetLevel.mock.invocationCallOrder[0]!);
    });

    it('ignores a second tap while saving', async () => {
      mockState = freshState();
      render(<HomeScreen />);
      fireEvent.press(screen.getByLabelText('Start at selected level'));
      fireEvent.press(screen.getByLabelText('Start at selected level'));
      await waitFor(() => expect(mockSetTargetLevel).toHaveBeenCalledTimes(1));
      expect(mockImportBaseline).toHaveBeenCalledTimes(1);
    });

    it('the import link navigates', () => {
      mockState = freshState();
      render(<HomeScreen />);
      fireEvent.press(screen.getByLabelText('Import existing progress'));
      expect(mockPush).toHaveBeenCalledWith('/onboarding/import');
    });

    it('is hidden once a baseline exists', () => {
      render(<HomeScreen />);
      expect(screen.queryByText('Choose your starting level')).toBeNull();
    });

    it('is hidden once a session exists', () => {
      mockState = freshState({ sessions: [{ id: 's' }] });
      render(<HomeScreen />);
      expect(screen.queryByText('Choose your starting level')).toBeNull();
    });

    it('keeps the card and shows the error when choosing the level fails after the baseline saved', async () => {
      mockState = freshState();
      mockImportBaseline.mockImplementation(async () => { mockState = { ...mockState, baseline: ZERO_BASELINE }; });
      mockSetTargetLevel.mockRejectedValue(new Error('locked'));
      render(<HomeScreen />);
      fireEvent.press(screen.getByLabelText('Start at selected level'));
      expect(await screen.findByText('Could not save: locked')).toBeTruthy();
      expect(screen.getByText('Choose your starting level')).toBeTruthy();
    });

    it('shows an inline error when saving fails', async () => {
      mockState = freshState();
      mockImportBaseline.mockRejectedValue(new Error('disk full'));
      render(<HomeScreen />);
      fireEvent.press(screen.getByLabelText('Start at selected level'));
      expect(await screen.findByText('Could not save: disk full')).toBeTruthy();
    });
  });
});
