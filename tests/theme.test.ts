import { theme } from '@/theme';

describe('theme', () => {
  it('is a dark theme with distinct movement colours', () => {
    expect(theme.colors.bg).toBe('#0B0D10');
    expect(theme.colors.sixCount).not.toBe(theme.colors.navySeal);
  });

  it('scales spacing on a 4px base', () => {
    expect(theme.spacing(1)).toBe(4);
    expect(theme.spacing(4)).toBe(16);
  });

  it('uses a 16px card radius', () => {
    expect(theme.radii.card).toBe(16);
  });
});
