import { KeyboardAvoidingView } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import StatsScreen from '../../app/(tabs)/stats';
import { makeSession } from '../helpers/factories';

const mockEditSession = jest.fn();
const mockRemoveSession = jest.fn();

const mockSessions = [
  makeSession({ id: 's1', movement: 'SIX_COUNT', completedReps: 288, startedAt: '2026-10-05T06:00:00.000Z', effort: 8 }),
  makeSession({ id: 's2', movement: 'NAVY_SEAL', completedReps: 140, startedAt: '2026-10-06T06:00:00.000Z', effort: 9 }),
  makeSession({ id: 's3', movement: 'SIX_COUNT', completedReps: 300, startedAt: '2026-10-07T06:00:00.000Z', effort: 7 }),
];

jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) =>
    selector({
      sessions: mockSessions,
      editSession: mockEditSession,
      removeSession: mockRemoveSession,
      baseline: null,
      settings: { weeklyGoalMin: 80 },
    }),
  selectStats: () => ({
    totals: { total: 50_961, byMovement: { SIX_COUNT: 35_617, NAVY_SEAL: 15_344 }, workouts: 245 },
    records: {
      best20Min: { SIX_COUNT: 325, NAVY_SEAL: 150 },
      totalByMovement: { SIX_COUNT: 35_617, NAVY_SEAL: 15_344 },
    },
    streakWeeks: 16,
  }),
  selectProgression: () => ({ currentLevel: { order: 9, name: '4B' } }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockEditSession.mockResolvedValue(undefined);
  mockRemoveSession.mockResolvedValue(undefined);
});

describe('stats screen', () => {
  it('lifts the edit sheet above the keyboard on iOS so Save and Cancel stay reachable', () => {
    render(<StatsScreen />);
    fireEvent.press(screen.getByTestId('history-s1'));
    expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe('padding');
  });

  it('shows the four summary tiles', () => {
    render(<StatsScreen />);
    expect(screen.getByText('4B')).toBeTruthy();
    expect(screen.getByText('50,961')).toBeTruthy();
    expect(screen.getByText('245')).toBeTruthy();
    expect(screen.getByText('16')).toBeTruthy();
  });

  it('shows all four personal records', () => {
    render(<StatsScreen />);
    expect(screen.getByText('Best 6-count in 20:00')).toBeTruthy();
    expect(screen.getByText('325')).toBeTruthy();
    expect(screen.getByText('Best Navy Seal in 20:00')).toBeTruthy();
    expect(screen.getByText('150')).toBeTruthy();
    expect(screen.getByText('Total 6-counts')).toBeTruthy();
    expect(screen.getByText('Total Navy Seals')).toBeTruthy();
  });

  it('charts per-workout reps for the selected movement with a peak', () => {
    render(<StatsScreen />);
    expect(screen.getByText('Peak: 300')).toBeTruthy();
    expect(screen.getAllByTestId(/^bar-/)).toHaveLength(2);
  });

  it('switches the chart bucket', () => {
    render(<StatsScreen />);
    fireEvent.press(screen.getByLabelText('Group by Week'));
    expect(screen.getAllByTestId(/^bar-/)).toHaveLength(1);
    expect(screen.getByText('Peak: 588')).toBeTruthy();
  });

  it('switches the charted movement', () => {
    render(<StatsScreen />);
    fireEvent.press(screen.getByLabelText('Chart Navy Seal'));
    expect(screen.getByText('Peak: 140')).toBeTruthy();
  });

  it('lists history newest first', () => {
    render(<StatsScreen />);
    const rows = screen.getAllByTestId(/^history-/);
    expect(rows[0]!.props.testID).toBe('history-s3');
  });

  it('edits a session’s reps and effort', async () => {
    render(<StatsScreen />);
    fireEvent.press(screen.getByTestId('history-s1'));
    fireEvent.press(screen.getByLabelText('+ Completed reps'));
    fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(mockEditSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1', completedReps: 289, effort: 8 }),
    ));
  });

  it('clears the effort when stepped down to not set', async () => {
    render(<StatsScreen />);
    fireEvent.press(screen.getByTestId('history-s3')); // effort 7
    for (let i = 0; i < 7; i += 1) fireEvent.press(screen.getByLabelText('− Effort'));
    fireEvent.press(screen.getByLabelText('Save changes'));
    await waitFor(() => expect(mockEditSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's3', effort: null }),
    ));
  });

  it('shows an inline error when saving fails and keeps the sheet open', async () => {
    mockEditSession.mockRejectedValueOnce(new Error('disk full'));
    render(<StatsScreen />);
    fireEvent.press(screen.getByTestId('history-s1'));
    fireEvent.press(screen.getByLabelText('Save changes'));
    expect(await screen.findByText(/Could not save changes: disk full/)).toBeTruthy();
    expect(screen.getByLabelText('Save changes')).toBeTruthy();
  });

  it('asks for confirmation before deleting a session', async () => {
    render(<StatsScreen />);
    fireEvent.press(screen.getByTestId('history-s2'));
    fireEvent.press(screen.getByLabelText('Delete session'));
    expect(mockRemoveSession).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Confirm delete'));
    await waitFor(() => expect(mockRemoveSession).toHaveBeenCalledWith('s2'));
  });

  it('shows an inline error when deleting fails', async () => {
    mockRemoveSession.mockRejectedValueOnce(new Error('locked'));
    render(<StatsScreen />);
    fireEvent.press(screen.getByTestId('history-s2'));
    fireEvent.press(screen.getByLabelText('Delete session'));
    fireEvent.press(screen.getByLabelText('Confirm delete'));
    expect(await screen.findByText(/Could not delete the session: locked/)).toBeTruthy();
  });
});
