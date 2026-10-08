export const theme = {
  colors: {
    bg: '#0B0D10',
    card: '#14181D',
    border: '#232A32',
    text: '#F2F5F7',
    textDim: '#8A95A1',
    accent: '#3B82F6', // primary buttons + 6-count
    success: '#22C55E', // completed/progress + Navy Seal
    sixCount: '#3B82F6',
    navySeal: '#22C55E',
    danger: '#EF4444',
    scrim: '#000000AA', // modal backdrop
  },
  radii: { card: 16, pill: 999 },
  spacing: (n: number): number => n * 4,
  font: {
    h1: { fontSize: 32, fontWeight: '700' },
    h2: { fontSize: 20, fontWeight: '600' },
    body: { fontSize: 15, fontWeight: '400' },
    mono: { fontSize: 72, fontWeight: '700' },
  },
} as const;

export type Theme = typeof theme;
