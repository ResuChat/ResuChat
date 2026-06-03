import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import prettierPlugin from 'eslint-plugin-prettier'
import globals from 'globals'

export default [
  { ignores: ['node_modules', 'dist'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.es2021 },
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.ts'],
    plugins: { prettier: prettierPlugin },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]
