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
op freestanding(): {
    @statusCode code: 200;
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
    /**
     * A POST operation that uses multipart/form-data.
     *
     * @param data The data.
     *
     * @returns nothing.
     */
    @route("/mpfd")
    @post
    mpfd(@header `content-type`: "multipart/form-data", data: bytes): {
        @statusCode code: 200;
    };

    /**
     * A POST operation that uses application/json.
     */
    @route("/json")
    @post
    json(@body payload: Foo): Output;
}
