/**
 * Destructures a name into its components.
 *
 * The following case conventions are supported:
 * - PascalCase (["pascal", "case"])
 * - camelCase (["camel", "case"])
 * - snake_case (["snake", "case"])
 * - kebab-case (["kebab", "case"])
 * - dot.case (["dot", "case"])
 * - path/case (["path", "case"])
 * - paamayim::nekudotayim::case (["paamayim", "nekudotayim", "case"])
 * - space separated (["space", "separated"])
 *
 * - AND any combination of the above, or any other separators or combination of separators.
 *
 * @param name - a name in any case
 */
export declare function parseCase(name: string): ReCase;
export interface ReCase extends ReCaseUpper {
    readonly components: readonly string[];
    readonly pascalCase: string;
    readonly camelCase: string;
    readonly upper: ReCaseUpper;
}
interface ReCaseUpper {
    readonly snakeCase: string;
    readonly kebabCase: string;
    readonly dotCase: string;
    readonly pathCase: string;
    join(separator: string): string;
}
export {};
