const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['android/**', 'ios/**', 'dist/**', 'coverage/**', 'node_modules/**', '.native-check/**', 'modules/show-voice/vendor/**'] },
]);
