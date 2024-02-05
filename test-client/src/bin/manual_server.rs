#![feature(impl_trait_in_assoc_type)]

use hyper::server::conn::http1;
use hyper_util::rt::TokioIo;
use std::net::SocketAddr;
use test_client::server::{MainService, MainServiceRouter};
use tokio::net::TcpListener;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));

    let listener = TcpListener::bind(addr).await?;

    loop {
        let (stream, _) = listener.accept().await?;

        let io = TokioIo::new(stream);

        tokio::spawn(async move {
            if let Err(err) = http1::Builder::new()
                .serve_connection(
                    io,
                    hyper_util::service::TowerToHyperService::new(MainServiceRouter::new(
                        MainService,
                    )),
                )
                .await
            {
                eprintln!("server error: {}", err);
            }
        });
    }
}
