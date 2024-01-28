import {
  DiagnosticTarget,
  ModelProperty,
  Node,
  SyntaxKind,
} from "@typespec/compiler";

export function getModelPropertyTypeSyntaxTarget(
  property: ModelProperty
): DiagnosticTarget {
  const node = property.node;

  switch (node.kind) {
    case SyntaxKind.ModelProperty: {
      return node.value;
    }
    case SyntaxKind.ProjectionModelProperty:
    case SyntaxKind.ProjectionModelSpreadProperty:
    case SyntaxKind.ModelSpreadProperty: {
      // TODO: correct for projections?
      return node;
    }
    default: {
      throw new Error(
        `UNREACHABLE: node kind '${
          (node satisfies never as Node).kind
        }' in model property`
      );
    }
  }
}
