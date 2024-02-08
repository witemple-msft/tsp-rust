use std::net::SocketAddr;

use hyper::server::conn::http1;
use hyper_util::rt::TokioIo;
use petstore::{http::router::PetStoreRouter, petstore_logic::PetStore};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));

    let listener = TcpListener::bind(addr).await?;

    let petstore = PetStore::new();

    loop {
        let (stream, _) = listener.accept().await?;

        let io = TokioIo::new(stream);

        let petstore = petstore.clone();

        tokio::spawn(async move {
            if let Err(err) = http1::Builder::new()
                .serve_connection(
                    io,
                    hyper_util::service::TowerToHyperService::new(PetStoreRouter::new(petstore)),
                )
                .await
            {
                eprintln!("server error: {}", err);
            }
        });
    }
}
