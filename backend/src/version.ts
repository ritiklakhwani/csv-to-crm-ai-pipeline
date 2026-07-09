/**
 * Kept as a constant rather than read from package.json: the bundled `dist/index.js` has no
 * package.json beside it, and JSON import attributes would tie us to a specific module resolution.
 */
export const APP_VERSION = '1.0.0';
