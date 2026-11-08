import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },

  js.configs.recommended,

  {
    // Extension source: runs in browser, service worker, and extension contexts.
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...globals.webextensions,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      eqeqeq: 'error',
      'prefer-const': 'error',
    },
  },

  {
    // Tests and tool configs run in Node. UI tests also use jsdom, which provides browser globals.
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Must be last: turns off style rules that conflict with Prettier.
  prettier,
];
