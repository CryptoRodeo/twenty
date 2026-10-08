import { fireEvent, render, screen } from '@testing-library/react-native';
import { GRADUATION_VALID_DAYS, LEVELS } from '@/domain/levels';
import LevelUpScreen from '../../app/levelup';

const mockReplace = jest.fn();
const mockClearLevelUp = jest.fn();
let mockOrder: string;
let mockNextLevel: unknown;

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({ order: mockOrder }),
}));
jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector({ clearLevelUp: mockClearLevelUp }),
  selectProgression: () => ({ nextLevel: mockNextLevel }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockOrder = '3';
  mockNextLevel = LEVELS[4];
});

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

  it('honours the chosen target level for Next (1A reached while working toward 1C)', () => {
    mockOrder = '0';
    mockNextLevel = LEVELS[2];
    render(<LevelUpScreen />);
    const c = LEVELS[2]!;
    expect(screen.getByText(`Next: ${c.name} — ${c.targets.SIX_COUNT} / ${c.targets.NAVY_SEAL}`)).toBeTruthy();
  });

  it('states the graduation validity from GRADUATION_VALID_DAYS when there is no next level', () => {
    mockOrder = '10';
    mockNextLevel = null;
    render(<LevelUpScreen />);
    expect(screen.getByText(
      `Program complete — keep re-confirming graduation every ${GRADUATION_VALID_DAYS} days.`,
    )).toBeTruthy();
  });

  it('clears the flag and returns to the tabs', () => {
    render(<LevelUpScreen />);
    fireEvent.press(screen.getByLabelText('Continue'));
    expect(mockClearLevelUp).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
