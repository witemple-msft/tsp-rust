use hyper_util::client::legacy::connect::HttpConnector;
use tsp_rust::{http::Body, vendored::tower::ServiceBuilder};

use petstore::{http::operations::client_raw as pets, models::synthetic::PetKind, Pet};

type HyperClient = hyper_util::client::legacy::Client<HttpConnector, Body>;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client: HyperClient =
        hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
            .build_http();

    let mut service = ServiceBuilder::new()
        .map_request(|request: ::tsp_rust::vendored::http::Request<::tsp_rust::http::Body>| -> ::tsp_rust::vendored::http::Request<_> {
            let (mut parts, body) = request.into_parts();

            // canonicalize URI
            parts.uri = ::tsp_rust::vendored::http::Uri::try_from(format!(
                "http://localhost:8080{}",
                parts.uri
            ))
            .unwrap();

            ::tsp_rust::vendored::http::Request::from_parts(parts, body)
        })
        .service(client);

    println!("Creating pet");

    pets::create(
        &mut service,
        Pet {
            name: "Fido".to_string(),
            age: 2,
            kind: PetKind::Dog,
        },
    )
    .await
    .expect("create failed");

    println!("Listing pets");

    let pets = pets::list(&mut service).await.expect("list failed");

    for pet in pets {
        println!("Pet: {:?}", pet);
    }

    println!("Deleting pet");

    pets::delete(&mut service, "Fido")
        .await
        .expect("delete failed");

    println!("Listing pets");

    let pets = pets::list(&mut service).await.expect("list failed");

    for pet in pets {
        println!("Pet: {:?}", pet);
    }

    Ok(())
}
