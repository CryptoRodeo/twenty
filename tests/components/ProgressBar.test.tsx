import { render } from '@testing-library/react-native';
import { ProgressBar } from '@/components/ProgressBar';

describe('ProgressBar', () => {
  it('reports its value for accessibility', () => {
    const { getByTestId } = render(<ProgressBar value={150} max={300} testID="bar" />);
    expect(getByTestId('bar').props.accessibilityValue).toEqual({ now: 150, max: 300 });
  });

  it('clamps above max and below zero', () => {
    const over = render(<ProgressBar value={400} max={300} testID="bar" />);
    expect(over.getByTestId('bar').props.accessibilityValue.now).toBe(300);
    const under = render(<ProgressBar value={-10} max={300} testID="bar2" />);
    expect(under.getByTestId('bar2').props.accessibilityValue.now).toBe(0);
  });

  it('survives a zero max with a 0% fill (no NaN)', () => {
    const { getByTestId } = render(<ProgressBar value={5} max={0} testID="bar" />);
    const style = getByTestId('bar-fill').props.style;
    expect(style.width).toBe('0%');
    expect(getByTestId('bar').props.accessibilityValue).toEqual({ now: 0, max: 0 });
  });

  it('renders its label when given one', () => {
    const { getByText } = render(<ProgressBar value={1} max={2} label="6-count 150/300" />);
    expect(getByText('6-count 150/300')).toBeTruthy();
  });
});
