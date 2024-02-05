import "@typespec/http";

using TypeSpec.Http;

/**
 * Some namespace documentation.
 */
@service({
    title: "Example Service",
})
@server(
    "https://{endpoint}",
    "",
    {
        endpoint: string,
    }
)
namespace Example;

@error
model Error {
    @statusCode code: 400;
    @body body: {
        message: string;
    }
}

/**
 * A freestanding operation.
 */
@route("/freestanding")
@get
op freestanding(@header("X-Foo") foo: string): {
    @statusCode code: 200;
    @header("X-Bar") bar: string;
    @body example: bytes;
} | Error;

/**
 * A freestanding operation with a path parameter and query parameter.
 */
@route("/freestanding/{id}")
@post
op freestandingPath(@path id: string, @query q: string): {
    @statusCode code: 200;
    @header("X-Composite") composite: string;
    @body example: bytes;
} | Error;


/**
 * A Foo example model.
 */
model Foo {
    /**
     * A string field.
     */
    a: string;

    /**
     * A number field.
     */
    b: uint32;

    setting: "this is a setting";
}

/**
 * An Output example model.
 */
model Output {
    /**
     * A boolean field.
     */
    x: boolean;

    /**
     * An anonymous model field.
     */
    y: {
        /**
         * A decimal field.
         */
        z: decimal;
    };
}

/**
 * Some example operations.
 */
@route("/operations")
interface Operations {
    // /**
    //  * A POST operation that uses multipart/form-data.
    //  *
    //  * @param data The data.
    //  *
    //  * @returns nothing.
    //  */
    // @route("/mpfd")
    // @post
    // mpfd(@header `content-type`: "multipart/form-data", data: bytes): {
    //     @statusCode code: 200;
    // };

    /**
     * A POST operation that uses application/json.
     */
    @route("/json")
    @post
    json(@body payload: Foo): Output;
}
