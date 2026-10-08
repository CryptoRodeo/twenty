import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../../app/settings';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockSetTargetLevel = jest.fn();
const mockUpdateSettings = jest.fn();
const mockRestoreBackup = jest.fn();
const mockExportBackup = jest.fn();
let mockState: Record<string, unknown>;

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: mockPush }) }));
jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector(mockState),
}));
jest.mock('@/data/backup', () => ({
  exportBackup: (...a: unknown[]) => mockExportBackup(...a),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSetTargetLevel.mockResolvedValue(undefined);
  mockUpdateSettings.mockResolvedValue(undefined);
  mockRestoreBackup.mockResolvedValue(undefined);
  mockState = {
    ready: true, db: { tag: 'db' }, restoreBackup: mockRestoreBackup,
    updateSettings: mockUpdateSettings, setTargetLevel: mockSetTargetLevel,
    settings: {
      weeklyGoalMin: 80, soundOn: true, hapticsOn: true, countInSec: 10, targetLevelOrder: 2,
    },
  };
});

describe('settings', () => {
  it('marks the working level and changes it through the store', async () => {
    render(<SettingsScreen />);
    expect(screen.getByLabelText('Working level 1C').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByLabelText('Working level 2A'));
    await waitFor(() => expect(mockSetTargetLevel).toHaveBeenCalledWith(4));
    await act(async () => {});
  });

  it('shows an error when changing the level fails', async () => {
    mockSetTargetLevel.mockRejectedValueOnce(new Error('disk full'));
    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Working level 2A'));
    await waitFor(() => expect(screen.getByText('disk full')).toBeTruthy());
    await act(async () => {});
  });

  it('steps the weekly goal by one landmark session', async () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('+ Minutes per week'));
    expect(mockUpdateSettings).toHaveBeenCalledWith({ weeklyGoalMin: 100 });
    await act(async () => {});
  });

  it('asks for confirmation before a destructive restore', async () => {
    render(<SettingsScreen />);
    fireEvent.changeText(screen.getByLabelText('Restore JSON'), '{"version":1}');
    fireEvent.press(screen.getByLabelText('Restore backup'));
    expect(mockRestoreBackup).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Confirm restore'));
    await waitFor(() => expect(mockRestoreBackup).toHaveBeenCalledWith('{"version":1}'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
    await act(async () => {});
  });

  it('cancels a pending restore without touching data', () => {
    render(<SettingsScreen />);
    fireEvent.changeText(screen.getByLabelText('Restore JSON'), '{}');
    fireEvent.press(screen.getByLabelText('Restore backup'));
    fireEvent.press(screen.getByLabelText('Cancel restore'));
    expect(mockRestoreBackup).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Restore backup')).toBeTruthy();
  });

  it('reports a failed restore and stays on the screen', async () => {
    mockRestoreBackup.mockRejectedValueOnce(new Error('Unsupported backup version 99'));
    render(<SettingsScreen />);
    fireEvent.changeText(screen.getByLabelText('Restore JSON'), '{}');
    fireEvent.press(screen.getByLabelText('Restore backup'));
    fireEvent.press(screen.getByLabelText('Confirm restore'));
    await waitFor(() => expect(screen.getByText('Unsupported backup version 99')).toBeTruthy());
    await act(async () => {});
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows an inline error when a settings change fails', async () => {
    mockUpdateSettings.mockRejectedValueOnce(new Error('write failed'));
    render(<SettingsScreen />);
    fireEvent(screen.getByLabelText('Sound'), 'valueChange', false);
    await waitFor(() => expect(screen.getByText('write failed')).toBeTruthy());
    await act(async () => {}); // let run() finish clearing busy
    mockUpdateSettings.mockRejectedValueOnce(new Error('step failed'));
    fireEvent.press(screen.getByLabelText('+ Count-in seconds'));
    await waitFor(() => expect(screen.getByText('step failed')).toBeTruthy());
    await act(async () => {});
  });

  it('opens the import screen in edit mode to re-enter the baseline', () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Re-enter baseline'));
    expect(mockPush).toHaveBeenCalledWith('/onboarding/import?mode=edit');
  });
});
