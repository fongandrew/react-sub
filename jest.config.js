const { defaults } = require('jest-config');
module.exports = {
    moduleFileExtensions: [...defaults.moduleFileExtensions, 'ts', 'tsx'],
    testMatch: [
        '**/?(*.)spec.(j|t)s?(x)',
    ],
    restoreMocks: true,
    clearMocks: true,
    setupTestFrameworkScriptFile: './jest-setup.js',
    transform: {
        "^.+\\.(ts|tsx)$": "ts-jest"
    },
    globals: {
        "ts-jest": {
            tsConfigFile: "tsconfig-test.json"
        }
    },
};
