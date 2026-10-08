import { render, screen, waitFor } from '@testing-library/react-native';
import RootLayout from '../app/_layout';

const mockState = {
  ready: false,
  baseline: {},
  sessions: [] as unknown[],
  init: jest.fn(),
  ensureWeek: jest.fn(),
};

jest.mock('@/store/useAppStore', () => {
  const hook = (sel: (s: typeof mockState) => unknown) => sel(mockState);
  hook.getState = () => mockState;
  return { useAppStore: hook };
});
jest.mock('@/data/db', () => ({ openAppDb: jest.fn(async () => ({})) }));
jest.mock('@/data/migrations', () => ({ runMigrations: jest.fn(async () => undefined) }));
jest.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return { Stack };
});
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: unknown }) => children,
}));

it('shows the bootstrap error even after init has marked the store ready', async () => {
  mockState.init.mockImplementation(async () => { mockState.ready = true; });
  mockState.ensureWeek.mockRejectedValue(new Error('disk full'));
  render(<RootLayout />);
  await waitFor(() =>
    expect(screen.getByText('Could not open the database: disk full')).toBeTruthy());
});
