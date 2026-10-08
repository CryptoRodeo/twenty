import { render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import RootLayout from '../app/_layout';

const mockState = {
  ready: false,
  baseline: null as unknown,
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

it('plans the week at boot even on a fresh install with no baseline or history', async () => {
  mockState.baseline = null;
  mockState.sessions = [];
  mockState.ready = true;
  mockState.ensureWeek.mockReset();
  mockState.ensureWeek.mockResolvedValue(undefined);
  render(<RootLayout />);
  await waitFor(() => expect(mockState.ensureWeek).toHaveBeenCalledTimes(1));
});

it('re-plans the week when the app returns to the foreground', async () => {
  mockState.ready = true;
  mockState.ensureWeek.mockReset();
  mockState.ensureWeek.mockResolvedValue(undefined);
  let listener: ((status: string) => void) | undefined;
  const remove = jest.fn();
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (status: string) => void) => {
    listener = cb;
    return { remove };
  }) as never);
  const view = render(<RootLayout />);
  await waitFor(() => expect(listener).toBeDefined());
  await waitFor(() => expect(mockState.ensureWeek).toHaveBeenCalledTimes(1)); // bootstrap
  listener!('background');
  expect(mockState.ensureWeek).toHaveBeenCalledTimes(1);
  listener!('active');
  expect(mockState.ensureWeek).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(remove).toHaveBeenCalled();
  spy.mockRestore();
});

it('does not show the database error when a foreground re-plan fails', async () => {
  mockState.ready = true;
  mockState.ensureWeek.mockReset();
  mockState.ensureWeek.mockResolvedValueOnce(undefined); // bootstrap
  mockState.ensureWeek.mockRejectedValue(new Error('locked'));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  let listener: ((status: string) => void) | undefined;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (status: string) => void) => {
    listener = cb;
    return { remove: jest.fn() };
  }) as never);
  render(<RootLayout />);
  await waitFor(() => expect(listener).toBeDefined());
  await waitFor(() => expect(mockState.ensureWeek).toHaveBeenCalledTimes(1));
  listener!('active');
  await waitFor(() => expect(warn).toHaveBeenCalled());
  expect(screen.queryByText(/Could not open the database/)).toBeNull();
  spy.mockRestore();
  warn.mockRestore();
});
