import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi3";

using TypeSpec.Http;
using TypeSpec.Rest;

/** This is a sample CRUD pet store service. */
@service({
  title: "Pet Store Service",
  version: "2024-02-05"
})
@server("https://example.com", "The service endpoint")
namespace PetStore;

@route("/pets")
interface Pets {
  list(): Pet[];
  create(@body pet: Pet): Pet;
  update(@path("id") id: string, @body pet: Pet): Pet;
  @delete
  delete(@path("id") id: string): void;
}

model Pet {
  @minLength(100)
  name: string;

  @minValue(0)
  @maxValue(100)
  age: int32;

  kind: "dog" | "cat" | "fish";
}