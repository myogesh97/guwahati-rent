import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'supabase/functions/deno.lock'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // `const { secret: _omit, ...pub } = row` is how private columns are dropped before a response.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Edge Functions run on Deno: `Deno` is a global there, and imports use .ts / npm: specifiers.
    files: ['supabase/functions/**/*.ts'],
    languageOptions: { globals: { Deno: 'readonly' } },
  },
);
