import prettierConfig from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';

export default [
    // Base Configuration recommended by ESLint
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...require('globals').node,
            },
        },
        plugins: {
            prettier,
        },
        rules: {
            'prettier/prettier': ['error', { endOfLine: 'auto' }],
            'no-unused-vars': 'error',
            'no-fallthrough': 'error', // Detect unintentional fall-through (in switch case)
            'default-case': 'error', // Optional : force default switch-case
        },
    },
    // Deactivate ESLint rules that enter in conflict with Prettier
    prettierConfig,
];
