import { render, screen } from '@testing-library/react-native';
import { LandmarkProgress } from '@/components/LandmarkProgress';

const base = { movement: 'SIX_COUNT' as const, best: 300, target: 325, met: false, remaining: 25, ratio: 0.92 };

describe('LandmarkProgress', () => {
  it('shows best over target and the bar value', () => {
    render(<LandmarkProgress progress={base} />);
    expect(screen.getByText('Best 300 / 325')).toBeTruthy();
    expect(screen.getByTestId('landmark-SIX_COUNT').props.accessibilityValue).toEqual({ now: 300, max: 325 });
    expect(screen.queryByText('Target reached')).toBeNull();
  });

  it('badges a met target', () => {
    render(<LandmarkProgress progress={{ ...base, best: 325, met: true, remaining: 0, ratio: 1 }} />);
    expect(screen.getByText('Target reached')).toBeTruthy();
  });
});
