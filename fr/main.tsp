import "@typespec/rest";
import "@typespec/versioning";
import "./routes.tsp";

import "tsp-rust";

using TypeSpec.Rest;
using TypeSpec.Http;
using TypeSpec.Versioning;

@versioned(APIVersion)
@service({
  title: "Form Recognizer",
})
@server(
  "{endpoint}/formrecognizer",
  "Extracts content, layout, and structured data from documents.",
  {
    @doc("""
Supported Cognitive Services endpoints (protocol and hostname, for
example:
https://westus2.api.cognitive.microsoft.com).
""")
    endpoint: string,
  }
)
@doc("Extracts content, layout, and structured data from documents.")
namespace FormRecognizer;

enum APIVersion {
  @useDependency(Azure.Core.Versions.v1_0_Preview_2)
  v2022_08_31: "2022-08-31",

  @useDependency(Azure.Core.Versions.v1_0_Preview_2)
  v2023_02_28_preview: "2023-02-28-preview",
}
