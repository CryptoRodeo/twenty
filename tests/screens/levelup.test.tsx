import { fireEvent, render, screen } from '@testing-library/react-native';
import LevelUpScreen from '../../app/levelup';

const mockReplace = jest.fn();
const mockClearLevelUp = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ order: '3' }),
}));
jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector({ clearLevelUp: mockClearLevelUp }),
}));

beforeEach(() => jest.clearAllMocks());

describe('level up screen', () => {
  it('names the level reached and its targets', () => {
    render(<LevelUpScreen />);
    expect(screen.getByText('Level 1D')).toBeTruthy();
    expect(screen.getByText('6-ct: 150   Navy: 60')).toBeTruthy();
  });

  it('names what comes next', () => {
    render(<LevelUpScreen />);
    expect(screen.getByText('Next: 2A — 200 / 80')).toBeTruthy();
  });

  it('clears the flag and returns to the tabs', () => {
    render(<LevelUpScreen />);
    fireEvent.press(screen.getByLabelText('Continue'));
    expect(mockClearLevelUp).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
