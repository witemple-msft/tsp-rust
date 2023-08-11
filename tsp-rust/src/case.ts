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
export function parseCase(name: string): ReCase {
  const components: string[] = [];

  let currentComponent = "";
  let inAcronym = false;

  for (let i = 0; i < name.length; i++) {
    const char = name[i];

    // Special case acronym handling. We want to treat acronyms as a single component,
    // but we also want the last capitalized letter in an all caps sequence to start a new
    // component if the next letter is lower case.
    // For example: "HTTPResponse" => ["http", "response"]
    //     : "OpenAIContext" => ["open", "ai", "context"]
    //  but: "HTTPresponse" (wrong) => ["htt", "presponse"]

    // If the character is a separator or an upper case character, we push the current component and start a new one.
    if (char === char.toUpperCase() && !/[0-9]/.test(char)) {
      // If we're in an acronym, we need to check if the next character is lower case.
      // If it is, then this is the start of a new component.
      const acronymRestart =
        inAcronym &&
        /[A-Z]/.test(char) &&
        i + 1 < name.length &&
        /[a-z]/.test(name[i + 1]);

      if (currentComponent.length > 0 && (acronymRestart || !inAcronym)) {
        components.push(currentComponent.trim());
        currentComponent = "";
      }
    }

    if (![":", "_", "-", ".", "/"].includes(char) && !/\s/.test(char)) {
      currentComponent += char.toLowerCase();
    }

    inAcronym = /[A-Z]/.test(char);
  }

  if (currentComponent.length > 0) {
    components.push(currentComponent);
  }

  return recase(components);
}

export interface ReCase {
  readonly components: readonly string[];
  readonly pascalCase: string;
  readonly camelCase: string;
  readonly snakeCase: string;
  readonly kebabCase: string;
  readonly dotCase: string;
  readonly pathCase: string;
}

function recase(components: readonly string[]): ReCase {
  return Object.freeze({
    components,
    get pascalCase() {
      return components
        .map((component) => component[0].toUpperCase() + component.slice(1))
        .join("");
    },
    get camelCase() {
      return components
        .map((component, index) =>
          index === 0
            ? component
            : component[0].toUpperCase() + component.slice(1)
        )
        .join("");
    },
    get snakeCase() {
      return components.join("_");
    },
    get kebabCase() {
      return components.join("-");
    },
    get dotCase() {
      return components.join(".");
    },
    get pathCase() {
      return components.join("/");
    },
  });
}
