const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'test-report.*',
      'playwright-report/**',
      'test-results/**',
      'eslint.config.js',
      'content.js',
      'popup.js',
      'options.js',
      'regex_examples.js',
      'util.js',
      'test.js'
    ]
  },
  js.configs.recommended,
  {
    files: [
      'scripts/**/*.js',
      'tests/**/*.js',
      'test.js',
      'jest.config.js',
      'playwright.config.js'
    ],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.jest
      }
    },
    rules: {
      'no-console': 'off'
    }
  }
];
