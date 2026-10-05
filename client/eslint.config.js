import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist', 'node_modules'] },
  {
    // Node-context config files
    files: ['*.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { react: react, 'react-hooks': reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Only track JSX variable usage — no stylistic react rules.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
    },
    settings: { react: { version: 'detect' } },
  },
];
