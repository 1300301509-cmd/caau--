import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.swc/**',
      'database/src/generated/**',
      'packages/api-client/src/generated/**',
      '.local/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/admin/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/miniapp/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { __API_BASE_URL__: 'readonly' } },
  },
  {
    files: [
      'apps/admin/src/**/*.{ts,tsx}',
      'apps/miniapp/src/**/*.{ts,tsx}',
      'packages/api-client/src/**/*.ts',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        'process',
        'Buffer',
        '__dirname',
        '__filename',
      ],
    },
  },
  {
    files: ['**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
