/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'selector-class-pattern': null,
    'custom-property-pattern': null,
    'no-descending-specificity': null,
    'keyframes-name-pattern': null,
    'no-invalid-position-at-import-rule': null,
    'import-notation': 'string',
    'declaration-block-no-redundant-longhand-properties': null,
    'no-invalid-double-slash-comments': null,
    'no-invalid-position-declaration': null,
    'no-duplicate-selectors': null,
    'function-no-unknown': [true, { ignoreFunctions: ['theme'] }],
    'at-rule-no-unknown': [
      true,
      { ignoreAtRules: ['theme', 'tailwind', 'apply', 'layer', 'config', 'import', 'screen'] }
    ]
  }
}
