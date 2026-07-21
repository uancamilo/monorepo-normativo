/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Las suites E2E levantan aplicaciones Nest completas. Limitar el
  // paralelismo evita presión de memoria y timeouts espurios de ts-jest sin
  // sacrificar por completo la ejecución concurrente.
  maxWorkers: 2,
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@normativo/dominio$': '<rootDir>/../dominio/src/index.ts',
    '^@normativo/aplicacion$': '<rootDir>/../aplicacion/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
};
