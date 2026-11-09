// ESLint v9 flat config for Stray Arrows.
//
// Scope: tools/*.js (Node build helpers) and sw.js (service worker) only.
// index.html is NOT linted here — it's a 4000-line monolith with inline
// JS, CSS and HTML; adding eslint-plugin-html and the parser config that
// would make it tractable is a separate, larger refactor (split into
// modules first). For now we lint everything *around* index.html so new
// build helpers and the SW are kept clean.
//
// Rule philosophy: catch real bugs (no-undef, no-unused-vars), not style.
// Prettier or manual style choices stay author's preference.

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'www/**',
      'android/**',
      'ios/**',
      'handcrafted-levels.js', // generated data, not really code
      'index.html',            // see header comment
      'tools/level-editor.html',
    ],
  },
  {
    files: ['tools/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js builtins
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        // Common globals used by the level baker / validator
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-implicit-globals': 'error',
      'no-var': 'warn',
      'prefer-const': 'warn',
      'eqeqeq': ['error', 'smart'],
    },
  },
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        // Service Worker scope
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        Promise: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'warn',
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
];
