import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { Baseline } from '@/domain/types';
import ImportScreen from '../../app/onboarding/import';

const mockBack = jest.fn();
const mockImportBaseline = jest.fn();
const mockImportSessions = jest.fn();
const mockSetTargetLevel = jest.fn();
let mockParams: Record<string, string>;
let mockBaseline: Baseline | null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({
      importBaseline: mockImportBaseline, importSessions: mockImportSessions, setTargetLevel: mockSetTargetLevel,
      baseline: mockBaseline, settings: { targetLevelOrder: 3 },
    }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockBaseline = null;
  mockImportBaseline.mockResolvedValue(undefined);
  mockImportSessions.mockResolvedValue({ imported: 1, skipped: 0 });
  mockSetTargetLevel.mockResolvedValue(undefined);
});

describe('import existing progress', () => {
  it('starts empty: no level and no numbers', () => {
    render(<ImportScreen />);
    expect(screen.getByLabelText("Level you're working on").props.children).toContain('Not started');
    for (const label of [
      'Best 6-count in 20 minutes', 'Best Navy Seal in 20 minutes',
      'Total 6-counts', 'Total Navy Seals', 'Workouts', 'Streak weeks', 'Past sessions CSV',
    ]) {
      expect(screen.getByLabelText(label).props.value).toBe('');
    }
    expect(screen.getByText('0 lifetime burpees')).toBeTruthy();
  });

  it('saves the entered baseline and goes home', async () => {
    render(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Set level 4B'));
    fireEvent.changeText(screen.getByLabelText('Best 6-count in 20 minutes'), '325');
    fireEvent.changeText(screen.getByLabelText('Best Navy Seal in 20 minutes'), '150');
    fireEvent.changeText(screen.getByLabelText('Total 6-counts'), '35617');
    fireEvent.changeText(screen.getByLabelText('Total Navy Seals'), '15344');
    fireEvent.changeText(screen.getByLabelText('Workouts'), '245');
    fireEvent.changeText(screen.getByLabelText('Streak weeks'), '16');
    fireEvent.press(screen.getByLabelText('Save imported progress'));

    await waitFor(() => expect(mockImportBaseline).toHaveBeenCalledWith({
      startLevelOrder: null,
      bestLandmark: { SIX_COUNT: 325, NAVY_SEAL: 150 },
      totalReps: { SIX_COUNT: 35_617, NAVY_SEAL: 15_344 },
      workouts: 245,
      streakWeeks: 16,
      graduationWeekStart: null,
    }));
    expect(mockSetTargetLevel).toHaveBeenCalledWith(9);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('sets the level last, after the baseline and CSV import', async () => {
    render(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Set level 1C'));
    fireEvent.changeText(screen.getByLabelText('Past sessions CSV'), '2026-09-28,SIX_COUNT,20,288,8');
    fireEvent.press(screen.getByLabelText('Save imported progress'));
    await waitFor(() => expect(mockSetTargetLevel).toHaveBeenCalledWith(2));
    const order = (m: jest.Mock) => m.mock.invocationCallOrder[0]!;
    expect(order(mockImportBaseline)).toBeLessThan(order(mockImportSessions));
    expect(order(mockImportSessions)).toBeLessThan(order(mockSetTargetLevel));
  });

  it('shows the derived lifetime total as it is typed', () => {
    render(<ImportScreen />);
    fireEvent.changeText(screen.getByLabelText('Total 6-counts'), '35617');
    fireEvent.changeText(screen.getByLabelText('Total Navy Seals'), '15344');
    expect(screen.getByText('50,961 lifetime burpees')).toBeTruthy();
  });

  it('imports pasted CSV history alongside the baseline', async () => {
    render(<ImportScreen />);
    fireEvent.changeText(screen.getByLabelText('Past sessions CSV'), '2026-09-28,SIX_COUNT,20,288,8');
    fireEvent.press(screen.getByLabelText('Save imported progress'));
    await waitFor(() => expect(mockImportSessions).toHaveBeenCalledWith([
      expect.objectContaining({ movement: 'SIX_COUNT', completedReps: 288 }),
    ]));
  });

  it('reports CSV problems without saving anything', () => {
    render(<ImportScreen />);
    fireEvent.changeText(screen.getByLabelText('Past sessions CSV'), 'nope');
    fireEvent.press(screen.getByLabelText('Save imported progress'));
    expect(screen.getByText(/line 1/)).toBeTruthy();
    expect(mockImportBaseline).not.toHaveBeenCalled();
  });

  it('skip writes a zero baseline so the Home card does not return', async () => {
    render(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Skip import'));
    await waitFor(() => expect(mockImportBaseline).toHaveBeenCalledWith(
      expect.objectContaining({ startLevelOrder: null, workouts: 0 }),
    ));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('shows an inline error, keeps the entered values and stays put when a save rejects', async () => {
    mockImportBaseline.mockRejectedValueOnce(new Error('disk full'));
    render(<ImportScreen />);
    fireEvent.changeText(screen.getByLabelText('Workouts'), '12');
    fireEvent.press(screen.getByLabelText('Save imported progress'));
    expect(await screen.findByText('Could not save: disk full')).toBeTruthy();
    expect(screen.getByLabelText('Workouts').props.value).toBe('12');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows an inline error when importing sessions rejects', async () => {
    mockImportSessions.mockRejectedValueOnce(new Error('bad write'));
    render(<ImportScreen />);
    fireEvent.changeText(screen.getByLabelText('Past sessions CSV'), '2026-09-28,SIX_COUNT,20,288,8');
    fireEvent.press(screen.getByLabelText('Save imported progress'));
    expect(await screen.findByText('Could not save: bad write')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });

  describe('edit mode (Settings > Re-enter baseline)', () => {
    const stored: Baseline = {
      startLevelOrder: 4,
      bestLandmark: { SIX_COUNT: 210, NAVY_SEAL: 85 },
      totalReps: { SIX_COUNT: 9000, NAVY_SEAL: 4000 },
      workouts: 60,
      streakWeeks: 7,
      graduationWeekStart: null,
    };

    beforeEach(() => {
      mockParams = { mode: 'edit' };
      mockBaseline = stored;
    });

    it('prefills the stored baseline and working level', () => {
      render(<ImportScreen />);
      expect(screen.getByLabelText("Level you're working on").props.children).toBe('1D');
      expect(screen.getByLabelText('Best 6-count in 20 minutes').props.value).toBe('210');
      expect(screen.getByLabelText('Best Navy Seal in 20 minutes').props.value).toBe('85');
      expect(screen.getByLabelText('Total 6-counts').props.value).toBe('9000');
      expect(screen.getByLabelText('Total Navy Seals').props.value).toBe('4000');
      expect(screen.getByLabelText('Workouts').props.value).toBe('60');
      expect(screen.getByLabelText('Streak weeks').props.value).toBe('7');
    });

    it('saving one change keeps everything else', async () => {
      render(<ImportScreen />);
      fireEvent.changeText(screen.getByLabelText('Workouts'), '61');
      fireEvent.press(screen.getByLabelText('Save imported progress'));
      await waitFor(() => expect(mockImportBaseline).toHaveBeenCalledWith({ ...stored, workouts: 61 }));
      await waitFor(() => expect(mockSetTargetLevel).toHaveBeenCalledWith(3));
    });

    it('Skip goes back without writing anything', () => {
      render(<ImportScreen />);
      fireEvent.press(screen.getByLabelText('Skip import'));
      expect(mockBack).toHaveBeenCalled();
      expect(mockImportBaseline).not.toHaveBeenCalled();
      expect(mockImportSessions).not.toHaveBeenCalled();
      expect(mockSetTargetLevel).not.toHaveBeenCalled();
    });

    it('reports skipped duplicate CSV rows and stays on screen', async () => {
      mockImportSessions.mockResolvedValue({ imported: 1, skipped: 2 });
      render(<ImportScreen />);
      fireEvent.changeText(screen.getByLabelText('Past sessions CSV'), '2026-09-28,SIX_COUNT,20,288,8');
      fireEvent.press(screen.getByLabelText('Save imported progress'));
      expect(await screen.findByText('Saved. 1 imported, 2 duplicate rows skipped.')).toBeTruthy();
      expect(mockBack).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Past sessions CSV').props.value).toBe('');
    });
  });
});
