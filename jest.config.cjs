const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  setupFiles: ['<rootDir>/test/setup.cjs'],
  testTimeout: 30000,
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: 'tsconfig.json', diagnostics: true },
    ],
  },
};

module.exports = {
  projects: ['unit', 'integration', 'e2e'].map((name) => ({
    ...base,
    displayName: name,
    testMatch: ['<rootDir>/test/' + name + '/**/*.spec.ts'],
  })),
};
