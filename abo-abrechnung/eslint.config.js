const spfxProfile = require('@microsoft/eslint-config-spfx/lib/flat-profiles/react');

module.exports = [
  ...spfxProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig.json'
      }
    },
    rules: {
      // SharePoint liefert leere Felder als null; null steht im Modell bewusst für "nicht gesetzt".
      '@rushstack/no-new-null': 'off'
    }
  }
];
