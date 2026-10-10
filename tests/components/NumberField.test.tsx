import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NumberField } from '@/components/NumberField';

function Harness({ initial = 10, min, max, spy }: {
  initial?: number; min?: number; max?: number; spy?: jest.Mock;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NumberField
      value={value}
      onChange={(n) => { spy?.(n); setValue(n); }}
      accessibilityLabel="Reps"
      min={min}
      max={max}
    />
  );
}

describe('NumberField', () => {
  it('opens the numeric keyboard and shows the value', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Reps');
    expect(input.props.keyboardType).toBe('number-pad');
    expect(screen.getByDisplayValue('10')).toBeTruthy();
  });

  it('commits valid values as you type', () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);
    fireEvent.changeText(screen.getByLabelText('Reps'), '50');
    expect(spy).toHaveBeenLastCalledWith(50);
    expect(screen.getByDisplayValue('50')).toBeTruthy();
  });

  it('keeps digits only', () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);
    fireEvent.changeText(screen.getByLabelText('Reps'), '5a0');
    expect(spy).toHaveBeenLastCalledWith(50);
    fireEvent.changeText(screen.getByLabelText('Reps'), '-3');
    expect(spy).toHaveBeenLastCalledWith(3);
    fireEvent.changeText(screen.getByLabelText('Reps'), '1.5');
    expect(spy).toHaveBeenLastCalledWith(15);
  });

  it('reverts an empty field on blur', () => {
    const spy = jest.fn();
    render(<Harness spy={spy} />);
    const input = screen.getByLabelText('Reps');
    fireEvent.changeText(input, '');
    fireEvent(input, 'blur');
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
  });

  it('clamps out-of-range input on blur, never while typing', () => {
    const spy = jest.fn();
    render(<Harness min={1} max={30} spy={spy} />);
    const input = screen.getByLabelText('Reps');
    fireEvent.changeText(input, '0');
    expect(spy).not.toHaveBeenCalled();
    fireEvent(input, 'blur');
    expect(spy).toHaveBeenLastCalledWith(1);
    expect(screen.getByDisplayValue('1')).toBeTruthy();
    fireEvent.changeText(input, '45');
    fireEvent(input, 'submitEditing');
    expect(spy).toHaveBeenLastCalledWith(30);
    expect(screen.getByDisplayValue('30')).toBeTruthy();
  });

  it('resyncs when the value changes from outside', () => {
    const { rerender } = render(
      <NumberField value={10} onChange={() => {}} accessibilityLabel="Reps" />,
    );
    rerender(<NumberField value={11} onChange={() => {}} accessibilityLabel="Reps" />);
    expect(screen.getByDisplayValue('11')).toBeTruthy();
  });

  it('with commitOnBlur, only reports the value when the field is left', () => {
    const spy = jest.fn();
    render(<NumberField value={60} onChange={spy} accessibilityLabel="Reps" commitOnBlur />);
    const input = screen.getByLabelText('Reps');
    fireEvent.changeText(input, '20');
    fireEvent.changeText(input, '200');
    expect(spy).not.toHaveBeenCalled();
    fireEvent(input, 'blur');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(200);
  });
});
