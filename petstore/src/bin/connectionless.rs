use petstore::{
    http::{operations::client_raw as pets, router::PetStoreRouter},
    models::synthetic::PetKind,
    petstore_logic::PetStore,
    Pet,
};

/// The point of this example is to show how the RPC abstraction of tower::Service is transferrable. This example uses
/// the generated HTTP client functions and generated HTTP server functions without a TCP socket. The data is still
/// marshalled through the HTTP types, but not through the actual HTTP wire protocol. This is possible because the
/// HTTP router implements the same service trait that the HTTP client functions are abstract over. It shows how the
/// wire protocol simply carries the types over the wire but the data interface on either end of the socket is exactly
/// the same.
///
/// This approach could be useful, for example, in testing. It allows testing the HTTP data marshalling without any
/// underlying dependency on a particular HTTP protocol implementation.
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Instead of creating a hyper HTTP client, create an instance of the HTTP router. This can be passed in to the
    // client methods in _exactly_ the same way as the hyper client, as both implement tower::Service over HTTP types.
    let mut backend = PetStoreRouter::new(PetStore::new());

    println!("Creating pet");

    pets::create(
        &mut backend,
        Pet {
            name: "Fido".to_string(),
            age: 2,
            kind: PetKind::Dog,
        },
    )
    .await
    .map_err(|_| anyhow::anyhow!("create failed"))?;

    println!("Listing pets");

    let pets = pets::list(&mut backend)
        .await
        .map_err(|_| anyhow::anyhow!("list failed"))?;

    for pet in pets {
        println!("Pet: {:?}", pet);
    }

    println!("Deleting pet");

    pets::delete(&mut backend, "Fido")
        .await
        .map_err(|_| anyhow::anyhow!("delete failed"))?;

    println!("Listing pets");

    let pets = pets::list(&mut backend)
        .await
        .map_err(|_| anyhow::anyhow!("list failed"))?;

    for pet in pets {
        println!("Pet: {:?}", pet);
    }

    Ok(())
}
