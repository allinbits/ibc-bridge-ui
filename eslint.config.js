import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { window: 'readonly', document: 'readonly', console: 'readonly', setTimeout: 'readonly', fetch: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly', AbortSignal: 'readonly' } } },
)
