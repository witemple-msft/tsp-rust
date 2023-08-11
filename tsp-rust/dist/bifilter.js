export function bifilter(values, predicate) {
    const pass = [];
    const fail = [];
    for (const value of values) {
        if (predicate(value)) {
            pass.push(value);
        }
        else {
            fail.push(value);
        }
    }
    return [pass, fail];
}
//# sourceMappingURL=bifilter.js.map