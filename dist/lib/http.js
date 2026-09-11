/**
 * Reads a single route parameter as a string. Express 5 types params as
 * `string | string[]`; single-segment params are always strings at runtime,
 * so we normalize (taking the first element if an array somehow appears).
 */
export function param(req, name) {
    const value = req.params[name];
    if (Array.isArray(value))
        return value[0] ?? '';
    return value ?? '';
}
//# sourceMappingURL=http.js.map