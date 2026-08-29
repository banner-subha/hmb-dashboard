import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'scratch/**',
    // Root-level scratch/verification scripts (n8n node snapshots, one-off checks)
    'compute_mom_monthly.js',
    'full_fixed_kpi_node.js',
    'validate_merge_v2.js',
    'verify_migration.js',
    'verify_pending.js',
    'test_app_wrapper.js',
    'test_data_context.js',
    'test_geo_rendering.js',
    'test_live_data.js',
    // n8n Code-node scripts kept under src/utils for reference
    'src/utils/processKPIs.js',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Positional helper signatures are kept for API compatibility
      // (e.g. getBusinessImpact(..., stateName, expectedMtd), normalizeDistrict(raw, state))
      'no-unused-vars': ['error', { args: 'none' }],
    },
  },
  {
    files: ['mcp-server/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
