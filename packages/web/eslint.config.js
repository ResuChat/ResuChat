import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import tseslint from 'typescript-eslint'
import eslintRecommended from '@eslint/js'
import prettierPlugin from 'eslint-plugin-prettier'
import globals from 'globals'

export default [
  eslintRecommended.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      },
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    }
  },
  {
    files: ['*.vue', '**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      prettier: prettierPlugin
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': 'off',
      'no-undef': 'off'
    }
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    plugins: {
      prettier: prettierPlugin
    },
    rules: {
      'prettier/prettier': 'error'
    }
  }
]
