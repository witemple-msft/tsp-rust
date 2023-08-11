export function* indent(values, indentation = "  ") {
    for (const value of values) {
        yield indentation + value;
    }
}
//# sourceMappingURL=indent.js.map