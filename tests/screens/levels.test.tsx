import { render, screen } from '@testing-library/react-native';
import LevelsScreen from '../../app/(tabs)/levels';

const mockPush = jest.fn();
let mockProgression: Record<string, unknown>;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector({}),
  selectProgression: () => mockProgression,
}));

beforeEach(() => {
  mockPush.mockClear();
  mockProgression = {
    currentLevelOrder: 9,
    currentLevel: { order: 9, name: '4B', targets: { SIX_COUNT: 300, NAVY_SEAL: 135 } },
    nextLevel: { order: 10, name: 'Graduation', targets: { SIX_COUNT: 325, NAVY_SEAL: 150 } },
    graduated: false,
    daysUntilGraduationExpiry: null,
    best: { SIX_COUNT: 300, NAVY_SEAL: 150 },
    nextTargets: {
      SIX_COUNT: { movement: 'SIX_COUNT', best: 300, target: 325, met: false, remaining: 25, ratio: 0.92 },
      NAVY_SEAL: { movement: 'NAVY_SEAL', best: 150, target: 150, met: true, remaining: 0, ratio: 1 },
    },
    reachedAt: { 0: '2026-01-05T06:00:00.000Z', 9: '2026-09-28T06:00:00.000Z' },
  };
});

describe('levels screen', () => {
  it('shows the current level and what is next', () => {
    render(<LevelsScreen />);
    expect(screen.getByText('Level 4B')).toBeTruthy();
    expect(screen.getByText('Next: Graduation')).toBeTruthy();
  });

  it('shows a labelled progress bar per movement', () => {
    render(<LevelsScreen />);
    expect(screen.getByText('6-count')).toBeTruthy();
    expect(screen.getByText('Best 300 / 325')).toBeTruthy();
    expect(screen.getByText('Navy Seal')).toBeTruthy();
    expect(screen.getByText('Best 150 / 150')).toBeTruthy();
  });

  it('renders all eleven roadmap rows', () => {
    render(<LevelsScreen />);
    expect(screen.getAllByLabelText(/^Level .+, (Completed|Current|Locked)/)).toHaveLength(11);
  });

  it('marks levels below the current one completed, the current one current, the rest locked', () => {
    render(<LevelsScreen />);
    expect(screen.getByLabelText(/^Level 1A, Completed/)).toBeTruthy();
    expect(screen.getByLabelText(/^Level 4B, Current/)).toBeTruthy();
    expect(screen.getByLabelText(/^Level Graduation, Locked/)).toBeTruthy();
  });

  it('shows no level as current before the first landmark', () => {
    mockProgression = { ...mockProgression, currentLevelOrder: null, currentLevel: null, nextLevel: { order: 0, name: '1A', targets: { SIX_COUNT: 1, NAVY_SEAL: 1 } } };
    render(<LevelsScreen />);
    expect(screen.getByText('No level yet')).toBeTruthy();
    expect(screen.getByLabelText(/^Level 1A, Locked/)).toBeTruthy();
  });

  it('shows the graduation countdown when graduated', () => {
    mockProgression = {
      ...mockProgression, currentLevelOrder: 10, graduated: true, nextLevel: null,
      currentLevel: { order: 10, name: 'Graduation', targets: { SIX_COUNT: 325, NAVY_SEAL: 150 } },
      daysUntilGraduationExpiry: 12,
    };
    render(<LevelsScreen />);
    expect(screen.getByText('Graduation expires in 12 days')).toBeTruthy();
  });
});
