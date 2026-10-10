import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import TimerSummaryScreen from '../../app/timer/summary';

const mockReplace = jest.fn();
const mockAddSession = jest.fn().mockResolvedValue({ id: 'new' });
let mockPendingLevelUp: number | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({
    movement: 'SIX_COUNT', targetReps: '292', durationSec: '1200',
    kind: 'GUIDED', completedReps: '288', startedAt: '2026-10-07T06:00:00.000Z',
    plannedId: 'slot-1',
  }),
}));
jest.mock('@/store/useAppStore', () => {
  const hook = (selector: (s: unknown) => unknown) =>
    selector({
      ready: true, addSession: mockAddSession, settings: { countInSec: 10 },
      sessions: [], baseline: null, planned: [],
    });
  hook.getState = () => ({ pendingLevelUp: mockPendingLevelUp });
  return {
    useAppStore: hook,
    selectProgression: () => ({ nextTargets: { SIX_COUNT: { target: 325 }, NAVY_SEAL: { target: 150 } } }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPendingLevelUp = null;
});

describe('timer summary', () => {
  it('shows the timer count and assumes it is right', () => {
    render(<TimerSummaryScreen />);
    expect(screen.getByText('You did 288 / 292')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirm timer count', selected: true })).toBeTruthy();
    expect(screen.queryByLabelText('Completed reps')).toBeNull();
  });

  it('saves the timer count when confirmed', async () => {
    render(<TimerSummaryScreen />);
    fireEvent.press(screen.getByLabelText('Confirm timer count'));
    fireEvent.press(screen.getByLabelText('Save workout'));
    await waitFor(() => expect(mockAddSession).toHaveBeenCalledWith(
      expect.objectContaining({ completedReps: 288, targetReps: 292 }), 'slot-1',
    ));
  });

  it('saves a typed number instead when the user did a different number', async () => {
    render(<TimerSummaryScreen />);
    fireEvent.press(screen.getByLabelText('Enter a different number'));
    const field = screen.getByLabelText('Completed reps');
    expect(field.props.keyboardType).toBe('number-pad');
    expect(screen.getByDisplayValue('288')).toBeTruthy();
    fireEvent.changeText(field, '250');
    fireEvent.press(screen.getByLabelText('Save workout'));
    await waitFor(() => expect(mockAddSession).toHaveBeenCalledWith(
      expect.objectContaining({ completedReps: 250 }), 'slot-1',
    ));
  });

  it('goes back to the timer count when switched back to confirm', async () => {
    render(<TimerSummaryScreen />);
    fireEvent.press(screen.getByLabelText('Enter a different number'));
    fireEvent.changeText(screen.getByLabelText('Completed reps'), '250');
    fireEvent.press(screen.getByLabelText('Confirm timer count'));
    expect(screen.queryByLabelText('Completed reps')).toBeNull();
    fireEvent.press(screen.getByLabelText('Save workout'));
    await waitFor(() => expect(mockAddSession).toHaveBeenCalledWith(
      expect.objectContaining({ completedReps: 288 }), 'slot-1',
    ));
  });

  it('celebrates a cleared landmark from a typed count', () => {
    render(<TimerSummaryScreen />);
    expect(screen.queryByText(/landmark cleared/i)).toBeNull();
    fireEvent.press(screen.getByLabelText('Enter a different number'));
    fireEvent.changeText(screen.getByLabelText('Completed reps'), '325');
    expect(screen.getByText(/landmark cleared/i)).toBeTruthy();
  });

  it('keeps the user on the summary with an error when saving fails', async () => {
    mockAddSession.mockRejectedValueOnce(new Error('disk full'));
    render(<TimerSummaryScreen />);
    fireEvent.press(screen.getByLabelText('Enter a different number'));
    fireEvent.changeText(screen.getByLabelText('Completed reps'), '289');
    fireEvent.press(screen.getByLabelText('Save workout'));
    await waitFor(() => expect(screen.getByText(/disk full/)).toBeTruthy());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('289')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Save workout'));
    await waitFor(() => expect(mockAddSession).toHaveBeenCalledTimes(2));
    expect(mockAddSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ completedReps: 289 }), 'slot-1',
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'));
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

  it('discards without writing anything', () => {
    render(<TimerSummaryScreen />);
    fireEvent.press(screen.getByLabelText('Discard workout'));
    expect(mockAddSession).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('celebrates after a level-up instead of returning to the tabs', async () => {
    mockPendingLevelUp = 3;
    render(<TimerSummaryScreen />);
    fireEvent.press(screen.getByLabelText('Save workout'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/levelup', params: { order: '3' },
    }));
  });
});
