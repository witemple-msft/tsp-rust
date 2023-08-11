import { Model, Program } from "@typespec/compiler";
import {
  HttpOperationParameter,
  HttpService,
  ServiceAuthentication,
} from "@typespec/http";

export interface RustContext {
  program: Program;
  service: HttpService;
  serviceTitle?: string;
  serviceVersion?: string;
  authenticationInfo?: ServiceAuthentication;

  contextTypeName: string;
  errorTypeName: string;

  modelQueue: Model[];
  synthetics: Synthetic[];
  visitedModels: Set<Model>;

  options: OptionsStructDefinition[];
}

export interface Synthetic {
  name: string;
  underlying: Model;
}

export interface OptionsStructDefinition {
  name: string;
  fields: HttpOperationParameter[];
}
