import { fireEvent, render, screen } from '@testing-library/react-native';
import { Chip } from '@/components/Chip';

describe('Chip', () => {
  it('exposes its selected state and label', () => {
    render(<Chip label="Easy" selected onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Easy', selected: true })).toBeTruthy();
  });

  it('reports unselected and calls onPress', () => {
    const onPress = jest.fn();
    render(<Chip label="Easy" selected={false} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Easy', selected: false }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('uses a custom accessibility label when given', () => {
    render(<Chip label="9" accessibilityLabel="Effort 9" selected={false} onPress={() => {}} />);
    expect(screen.getByLabelText('Effort 9')).toBeTruthy();
  });
});
