/**
 * Stands in for `process.env` in the browser bundle.
 *
 * Any variable the build does not pin explicitly resolves to undefined here
 * rather than reaching a real environment, so the published demo cannot read a
 * credential even if a future code path asks for one.
 */
export const __EMPTY_ENV__ = Object.freeze({});
