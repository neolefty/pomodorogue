import js from '@eslint/js'
import ts from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default ts.config(
  { ignores: ['dist', 'node_modules', 'src/game/sprites.ts'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // The determinism invariant from docs/port/03-core.md: level generation and
    // combat must be reproducible from a seed, so nothing in the game core may
    // reach for ambient randomness or wall-clock time. Both take an explicit
    // parameter instead (`Rng`, and `now` for the pomodoro schedule).
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'src/game must be deterministic: take an Rng parameter instead. See docs/port/03-core.md.',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            'src/game must be deterministic: take `now` as a parameter instead. See docs/port/03-core.md.',
        },
      ],
    },
  },
)
