const base = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
  setupFiles: ['<rootDir>/test/setup.cjs'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: 'tsconfig.json', diagnostics: true },
    ],
  },
};

module.exports = {
  testTimeout: 30000,
  projects: ['unit', 'integration', 'e2e'].map((name) => ({
    ...base,
    displayName: name,
    testMatch: ['<rootDir>/test/' + name + '/**/*.spec.ts'],
  })),
};
