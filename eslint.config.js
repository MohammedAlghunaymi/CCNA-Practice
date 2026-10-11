import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },

  js.configs.recommended,

  // App source: browser globals, JSX, React rules.
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      // `latest` rather than a pinned year: question and config data are
      // imported with import attributes (`with { type: 'json' }`), which is
      // newer than the 2023 parser the file used to pin.
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Warn, not error: lib/ modules legitimately export non-components.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },

  // Build and validation scripts: node globals, top-level await allowed.
  {
    files: ['scripts/**/*.mjs', '*.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Tests may lean on globals from the Vitest setup file. These mirror the src
  // block's language options: without an explicit ecmaVersion and sourceType,
  // JSX usage is not counted as variable usage and every rendered component
  // reads as unused.
  {
    files: ['tests/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Matches src: core `no-unused-vars` does not count a JSX element as a
    // variable reference, so component names would otherwise read as unused.
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
]