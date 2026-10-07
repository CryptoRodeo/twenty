// The domain's date helpers are deliberately local-time (Mon–Sun weeks in the
// user's own timezone), and the test fixtures are written as UTC instants.
// Pinning TZ keeps `weekStartIso` deterministic wherever the suite runs.
process.env.TZ = 'UTC';

module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  collectCoverageFrom: ['src/domain/**/*.ts'],
};
