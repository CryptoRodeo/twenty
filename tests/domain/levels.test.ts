import {
  GRADUATION_ORDER,
  GRADUATION_VALID_DAYS,
  LANDMARK_DURATION_SEC,
  LEVELS,
  levelByOrder,
  nextLevelAfter,
} from '@/domain/levels';

describe('levels table', () => {
  it('has 11 levels, 1A first and Graduation last', () => {
    expect(LEVELS).toHaveLength(11);
    expect(LEVELS[0]).toMatchObject({ order: 0, name: '1A' });
    expect(LEVELS[10]).toMatchObject({ order: 10, name: 'Graduation' });
    expect(GRADUATION_ORDER).toBe(10);
  });

  it('matches the spec targets exactly', () => {
    expect(LEVELS.map((l) => [l.name, l.targets.SIX_COUNT, l.targets.NAVY_SEAL])).toEqual([
      ['1A', 1, 1],
      ['1B', 50, 20],
      ['1C', 100, 40],
      ['1D', 150, 60],
      ['2A', 200, 80],
      ['2B', 225, 90],
      ['3A', 250, 100],
      ['3B', 260, 110],
      ['4A', 275, 120],
      ['4B', 300, 135],
      ['Graduation', 325, 150],
    ]);
  });

  it('is strictly increasing in both movements', () => {
    for (let i = 1; i < LEVELS.length; i += 1) {
      expect(LEVELS[i]!.targets.SIX_COUNT).toBeGreaterThan(LEVELS[i - 1]!.targets.SIX_COUNT);
      expect(LEVELS[i]!.targets.NAVY_SEAL).toBeGreaterThan(LEVELS[i - 1]!.targets.NAVY_SEAL);
    }
  });

  it('exposes the landmark window and graduation validity', () => {
    expect(LANDMARK_DURATION_SEC).toBe(1200);
    expect(GRADUATION_VALID_DAYS).toBe(30);
  });

  it('looks levels up by order and throws on unknown orders', () => {
    expect(levelByOrder(9).name).toBe('4B');
    expect(() => levelByOrder(11)).toThrow('Unknown level order: 11');
  });

  it('returns the next level, and null past Graduation', () => {
    expect(nextLevelAfter(null)!.name).toBe('1A');
    expect(nextLevelAfter(9)!.name).toBe('Graduation');
    expect(nextLevelAfter(10)).toBeNull();
  });
});
