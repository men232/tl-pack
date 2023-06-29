module.exports = {
  extends: ['eslint:recommended', 'prettier'],
  env: {
    node: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-fallthrough': ['error', { commentPattern: 'break[\\s\\w]*omitted' }],
    'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    'key-spacing': ['error', { mode: 'minimum' }],
    'no-multi-spaces': ['error', { exceptions: { VariableDeclarator: true } }],
    // 'space-before-function-paren': ['error', { anonymous: 'never', named: 'never', asyncArrow: 'always' }],
    semi: ['error', 'always', { omitLastInOneLineBlock: true }],
    'func-call-spacing': ['error', 'never'],
    quotes: ['error', 'single'],
    'no-mixed-spaces-and-tabs': [2, 'smart-tabs'],
  },
};
