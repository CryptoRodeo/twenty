import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import WeekEditScreen from '../../app/week/edit';

const mockBack = jest.fn();
const mockUpdateSettings = jest.fn().mockResolvedValue(undefined);
const mockSettings = {
  weeklyGoalMin: 80,
  countInSec: 10,
  soundOn: true,
  hapticsOn: true,
  planDays: [
    { dayOfWeek: 0, movement: 'SIX_COUNT' },
    { dayOfWeek: 1, movement: 'NAVY_SEAL' },
    { dayOfWeek: 2, movement: 'NAVY_SEAL' },
    { dayOfWeek: 6, movement: 'SIX_COUNT' },
  ],
};

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector({ settings: mockSettings, updateSettings: mockUpdateSettings }),
}));

beforeEach(() => jest.clearAllMocks());

describe('edit week', () => {
  it('shows a row for each weekday', () => {
    render(<WeekEditScreen />);
    expect(screen.getByText('Monday')).toBeTruthy();
    expect(screen.getByText('Sunday')).toBeTruthy();
  });

  it('preselects the stored plan', () => {
    render(<WeekEditScreen />);
    expect(screen.getByLabelText('Tuesday Navy Seal').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('Thursday Rest').props.accessibilityState.selected).toBe(true);
  });

  it('reports the planned weekly minutes against the goal', () => {
    render(<WeekEditScreen />);
    expect(screen.getByText('80 / 80 min planned')).toBeTruthy();
  });

  it('updates the total when a day is changed', () => {
    render(<WeekEditScreen />);
    fireEvent.press(screen.getByLabelText('Thursday 6-count'));
    expect(screen.getByText('100 / 80 min planned')).toBeTruthy();
  });

  it('says changes apply from next week', () => {
    render(<WeekEditScreen />);
    expect(screen.getByText('Changes apply from next week.')).toBeTruthy();
  });

  it('warns when the two movements are unbalanced', () => {
    render(<WeekEditScreen />);
    fireEvent.press(screen.getByLabelText('Sunday Rest'));
    expect(screen.getByText(/unbalanced/i)).toBeTruthy();
  });

  it('saves the edited plan days and goes back', async () => {
    render(<WeekEditScreen />);
    fireEvent.press(screen.getByLabelText('Thursday 6-count'));
    fireEvent.press(screen.getByLabelText('Save week'));
    await waitFor(() => expect(mockUpdateSettings).toHaveBeenCalledWith({
      planDays: [
        { dayOfWeek: 0, movement: 'SIX_COUNT' },
        { dayOfWeek: 1, movement: 'NAVY_SEAL' },
        { dayOfWeek: 2, movement: 'NAVY_SEAL' },
        { dayOfWeek: 3, movement: 'SIX_COUNT' },
        { dayOfWeek: 6, movement: 'SIX_COUNT' },
      ],
    }));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('shows an inline error and stays put when the save fails', async () => {
    mockUpdateSettings.mockRejectedValueOnce(new Error('disk full'));
    render(<WeekEditScreen />);
    fireEvent.press(screen.getByLabelText('Thursday 6-count'));
    fireEvent.press(screen.getByLabelText('Save week'));
    expect(await screen.findByText('Could not save: disk full')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Thursday 6-count').props.accessibilityState.selected).toBe(true);
  });
});
