// Flat ESLint config for the whole monorepo. Lint runs from the root in CI.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'firebase/functions/lib/**',
      '.plan/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.strict.rules,
    },
  },
  // WEB: the browser reaches Cloud Functions only through apps/web/src/api/ (.claude/rules/api-responses.md).
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase/functions',
              importNames: ['httpsCallable', 'httpsCallableFromURL'],
              message:
                'Call Cloud Functions through callApi in apps/web/src/api/ (.claude/rules/api-responses.md).',
            },
          ],
        },
      ],
    },
  },
  // WEB: one logger. Only apps/web/src/log.ts may touch the console (.claude/rules/logging.md).
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/log.ts'],
    rules: { 'no-console': ['error', { allow: ['none'] }] },
  },
  {
    files: ['apps/web/src/log.ts'],
    rules: { 'no-console': 'off' },
  },
  // WEB: a log message is a constant phrase; values go in fields (.claude/rules/logging.md).
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.object.name="log"][callee.property.name=/^(debug|info|warn|error)$/] > TemplateLiteral[expressions.length>0]',
          message:
            'Log a constant event phrase and put values in fields: log.info("Issued", { id }). See .claude/rules/logging.md.',
        },
        {
          selector:
            'CallExpression[callee.object.name="log"][callee.property.name=/^(debug|info|warn|error)$/] > BinaryExpression[operator="+"]',
          message:
            'Log a constant event phrase and put values in fields: log.info("Issued", { id }). See .claude/rules/logging.md.',
        },
      ],
    },
  },
  // FUNCTIONS: only firebase/functions/src/api/ throws HttpsError / calls onCall, and only
  // firebase/functions/src/logging/ (plus api/) touches the logger or console
  // (.claude/rules/api-responses.md, .claude/rules/logging.md).
  {
    files: ['firebase/functions/src/**/*.ts'],
    ignores: ['firebase/functions/src/api/**', 'firebase/functions/src/logging/**'],
    rules: {
      // Explicit options: a bare 'error' would keep the base config's allow: warn/error.
      'no-console': ['error', { allow: ['none'] }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...[
              'firebase-functions/v2/https',
              'firebase-functions/v1/https',
              'firebase-functions/https',
            ].map((name) => ({
              name,
              message:
                'Callables are created with apiCallable and fail with ApiException; only firebase/functions/src/api/ imports onCall or HttpsError (.claude/rules/api-responses.md).',
            })),
            // The https namespace reaches onCall and HttpsError without the subpath imports above.
            ...['firebase-functions', 'firebase-functions/v1', 'firebase-functions/v2'].map(
              (name) => ({
                name,
                importNames: ['https', 'default'],
                message:
                  'Callables are created with apiCallable and fail with ApiException; only firebase/functions/src/api/ reaches the https namespace (.claude/rules/api-responses.md).',
              }),
            ),
            {
              name: 'firebase-functions/logger',
              message:
                'Log through log from firebase/functions/src/logging/ (.claude/rules/logging.md).',
            },
            {
              name: 'firebase-functions',
              importNames: ['logger'],
              message:
                'Log through log from firebase/functions/src/logging/ (.claude/rules/logging.md).',
            },
          ],
        },
      ],
    },
  },
  // FUNCTIONS: a log message is a constant phrase; values go in fields (.claude/rules/logging.md).
  {
    files: ['firebase/functions/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.object.name="log"][callee.property.name=/^(debug|info|warn|error)$/] > TemplateLiteral[expressions.length>0]',
          message:
            'Log a constant event phrase and put values in fields: log.info("Issued", { id }). See .claude/rules/logging.md.',
        },
        {
          selector:
            'CallExpression[callee.object.name="log"][callee.property.name=/^(debug|info|warn|error)$/] > BinaryExpression[operator="+"]',
          message:
            'Log a constant event phrase and put values in fields: log.info("Issued", { id }). See .claude/rules/logging.md.',
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
);
