import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

/**
 * Рабочий конфиг — намеренное отличие от `ai-prompt-admin`, где весь eslint.config.js
 * закомментирован целиком (все 42 строки), то есть линта в проекте фактически нет.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.js'],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    files: ['src/**/*.ts', 'vite.config.ts'],
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',

      // Главное требование: типы наружу, никаких заглушек.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

      // TypeScript сам ловит необъявленные идентификаторы, а базовый no-undef не знает
      // о DOM-глобалях (document, localStorage, HTMLElement) и сыпал бы ложными ошибками.
      'no-undef': 'off',

      // Пользовательский текст и ответы LLM попадают в innerHTML — экранирование
      // обязательно, поэтому неявные приведения к строке ловим на корню.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },

  // Всегда последним: гасит правила, конфликтующие с Prettier.
  prettierConfig
);
