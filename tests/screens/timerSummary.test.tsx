import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import TimerSummaryScreen from '../../app/timer/summary';

const mockReplace = jest.fn();
const mockAddSession = jest.fn().mockResolvedValue({ id: 'new' });

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({
    movement: 'SIX_COUNT', targetReps: '292', durationSec: '1200',
    kind: 'GUIDED', completedReps: '288', startedAt: '2026-10-07T06:00:00.000Z',
    plannedId: 'slot-1',
  }),
}));
jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({
      ready: true, addSession: mockAddSession, settings: { countInSec: 10 },
      sessions: [], baseline: null, planned: [],
    }),
  selectProgression: () => ({ nextTargets: { SIX_COUNT: { target: 325 }, NAVY_SEAL: { target: 150 } } }),
}));

beforeEach(() => jest.clearAllMocks());

describe('timer summary', () => {
  it('pre-fills the reps the timer counted', () => {
    render(<TimerSummaryScreen />);
    expect(screen.getByText('288')).toBeTruthy();
  });

  it('lets the count be corrected before saving', () => {
    render(<TimerSummaryScreen />);
    fireEvent.press(screen.getByLabelText('+ Completed reps'));
    expect(screen.getByText('289')).toBeTruthy();
  });

  it('saves the session with the chosen effort and the planned slot', async () => {
    render(<TimerSummaryScreen />);
    fireEvent.press(screen.getByLabelText('Effort 9'));
    fireEvent.press(screen.getByLabelText('Save workout'));
    await waitFor(() => expect(mockAddSession).toHaveBeenCalledWith({
      movement: 'SIX_COUNT',
      startedAt: '2026-10-07T06:00:00.000Z',
      durationSec: 1200,
      targetReps: 292,
      completedReps: 288,
      effort: 9,
      kind: 'GUIDED',
    }, 'slot-1'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  });

  it('saves a null effort when none is chosen', async () => {
    render(<TimerSummaryScreen />);
    fireEvent.press(screen.getByLabelText('Save workout'));
    await waitFor(() => expect(mockAddSession).toHaveBeenCalledWith(
      expect.objectContaining({ effort: null }), 'slot-1',
    ));
  });

  it('celebrates a cleared landmark', () => {
    render(<TimerSummaryScreen />);
    for (let i = 0; i < 37; i += 1) fireEvent.press(screen.getByLabelText('+ Completed reps'));
    expect(screen.getByText(/landmark cleared/i)).toBeTruthy();
  });

  it('keeps the user on the summary with an error when saving fails', async () => {
    mockAddSession.mockRejectedValueOnce(new Error('disk full'));
    render(<TimerSummaryScreen />);
    fireEvent.press(screen.getByLabelText('+ Completed reps'));
    fireEvent.press(screen.getByLabelText('Save workout'));
    await waitFor(() => expect(screen.getByText(/disk full/)).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('289')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Save workout'));
    await waitFor(() => expect(mockAddSession).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
  });

  it('discards without writing anything', () => {
    render(<TimerSummaryScreen />);
    fireEvent.press(screen.getByLabelText('Discard workout'));
    expect(mockAddSession).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
