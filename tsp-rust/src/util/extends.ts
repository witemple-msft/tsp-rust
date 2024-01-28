import { Interface, Model, ModelProperty, Operation } from "@typespec/compiler";

export function getAllProperties(
  model: Model,
  visited: Set<Model> = new Set()
): ModelProperty[] {
  if (visited.has(model)) return [];

  visited.add(model);

  const properties = [...model.properties.values()];

  if (model.baseModel) {
    properties.push(...getAllProperties(model.baseModel, visited));
  }

  return properties;
}

export function getAllOperations(
  iface: Interface,
  visited: Set<Interface> = new Set()
): Operation[] {
  if (visited.has(iface)) return [];

  visited.add(iface);

  const operations = [...iface.operations.values()];

  if (iface.sourceInterfaces) {
    for (const source of iface.sourceInterfaces) {
      operations.push(...getAllOperations(source, visited));
    }
  }

  return operations;
}
