import { useEffect, useState } from 'react';
import { TextInput } from 'react-native';
import { theme } from '@/theme';

export interface NumberFieldProps {
  value: number;
  onChange: (next: number) => void;
  accessibilityLabel: string;
  min?: number;
  max?: number;
  /** Report only when the field is left — for screens that save every change. */
  commitOnBlur?: boolean;
}

/**
 * A whole-number field on the numeric keyboard. Valid in-range values commit
 * as you type, so pressing a button before the field blurs still sees them;
 * empty input reverts and out-of-range input clamps when the field is left.
 */
export function NumberField({
  value, onChange, accessibilityLabel, min = 0, max = Number.MAX_SAFE_INTEGER, commitOnBlur = false,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  function change(text: string): void {
    const digits = text.replace(/\D/g, '');
    setDraft(digits);
    if (commitOnBlur) return;
    const n = Number.parseInt(digits, 10);
    if (!Number.isNaN(n) && n >= min && n <= max && n !== value) onChange(n);
  }

  function commit(): void {
    const n = Number.parseInt(draft, 10);
    if (Number.isNaN(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.max(min, Math.min(max, n));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  }

  return (
    <TextInput
      value={draft}
      onChangeText={change}
      onBlur={commit}
      onSubmitEditing={commit}
      keyboardType="number-pad"
      selectTextOnFocus
      accessibilityLabel={accessibilityLabel}
      style={{
        ...theme.font.h1, color: theme.colors.text, textAlign: 'center',
        minWidth: 96, paddingVertical: theme.spacing(1),
        borderBottomWidth: 1, borderBottomColor: theme.colors.border,
      }}
    />
  );
}
