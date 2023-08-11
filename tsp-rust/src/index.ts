import { EmitContext, resolvePath } from "@typespec/compiler";
// import {
//   CodeTypeEmitter,
//   Context,
//   Declaration,
//   EmitEntity,
//   EmitterOutput,
//   Scope,
//   code,
// } from "@typespec/compiler/emitter-framework";
import {
  getAllHttpServices,
  //   getHttpOperation,
  //   getHttpService,
  //   listHttpOperationsIn,
} from "@typespec/http";
// import { parseCase } from "./case.js";
// import { bifilter } from "./bifilter.js";
import { emitRust } from "./rust.js";

export { $lib } from "./lib.js";

export const namespace = "TypeSpec";

// class RustEmitter extends CodeTypeEmitter {
//   programContext(program: Program): Context {
//     const outputFile = this.emitter.createSourceFile("output.rs");

//     return {
//       scope: outputFile.globalScope,
//     };
//   }

//   interfaceOperationDeclaration(
//     operation: Operation,
//     name: string
//   ): EmitterOutput<string> {
//     const nameCase = parseCase(name);

//     const [httpOperation, diagnostics] = getHttpOperation(
//       this.emitter.getProgram(),
//       operation
//     );

//     if (diagnostics.length > 0) {
//       throw new Error(
//         "UNREACHABLE: encounered diagnostics while getting HTTP operation, but we already checked this."
//       );
//     }

//     const { parameters, body } = httpOperation.parameters;

//     const [requiredParameters, optionalParameters] = bifilter(
//       parameters,
//       function (param) {
//         return !param.param.optional;
//       }
//     );

//     let requiredParametersCode = "";

//     for (const parameter of requiredParameters) {
//       const nameCase = parseCase(parameter.name);
//       requiredParametersCode += code`, ${
//         nameCase.snakeCase
//       }: ${this.emitter.emitType(parameter.param.type)}`;
//     }

//     return this.emitter.result.declaration(
//       name,
//       `pub fn ${
//         nameCase.snakeCase
//       }(context: &RequestContext${requiredParametersCode}) -> () {${code`
//   // ${httpOperation.verb}
//   let base_url = context.base_url();
// `}}`
//     );
//   }

//   reference(
//     targetDeclaration: Declaration<string>,
//     pathUp: Scope<string>[],
//     pathDown: Scope<string>[],
//     commonScope: Scope<string> | null
//   ): string | EmitEntity<string> {
//     console.log(
//       `Emitting reference for ${targetDeclaration.name} from ${pathUp
//         .map((scope) => scope.name)
//         .join("::")} to ${pathDown.map((scope) => scope.name).join("::")}.`
//     );

//     return targetDeclaration.name;
//   }
// }

export async function $onEmit(context: EmitContext) {
  //   const emitter = context.getAssetEmitter(RustEmitter);

  //   const [operations, diagnostics] = listHttpOperationsIn(
  //     context.program,
  //     context.program.getGlobalNamespaceType()
  //   );

  //   getHttpService

  //   if (diagnostics.length > 0) {
  //     throw new Error("Encountered errors while listing HTTP operations.");
  //   }

  //   for (const operation of operations) {
  //     emitter.emitType(operation.operation);
  //   }

  //   await emitter.writeOutput();

  const [services, diagnostics] = getAllHttpServices(context.program);

  if (diagnostics.length > 0) {
    throw new Error("Encountered errors while listing HTTP services.");
  }

  if (services.length !== 1) {
    throw new Error("Expected exactly one HTTP service.");
  }

  const service = services[0];

  const outputFile = emitRust(context, service);

  const outputPath = resolvePath(context.emitterOutputDir, "output.rs");

  await context.program.host.mkdirp(context.emitterOutputDir);
  await context.program.host.writeFile(outputPath, outputFile);
}
