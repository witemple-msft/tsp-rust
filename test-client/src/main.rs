use example2::models::all::Example;
use hyper_util::client::legacy::connect::HttpConnector;
use tsp_rust::{
    http::{Body, Error},
    vendored::tower::Service,
};

mod example;
mod example2;

type HyperClient = hyper_util::client::legacy::Client<HttpConnector, Body>;

pub struct Client {
    client: HyperClient,
}

impl Client {
    pub fn new() -> Self {
        Self {
            client: hyper_util::client::legacy::Client::builder(
                hyper_util::rt::TokioExecutor::new(),
            )
            .build_http(),
        }
    }
}

impl Example for Client {
    type Error<OperationError> = Error<
        hyper::body::Incoming,
        <HyperClient as Service<tsp_rust::vendored::http::Request<Body>>>::Error,
        OperationError,
    >;

    async fn freestanding(
        &mut self,
    ) -> Result<
        example2::models::synthetic::FreestandingResponse,
        Self::Error<example2::models::all::example::Error>,
    > {
        example2::http::operations::raw::freestanding(&mut self.client).await
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut client: HyperClient =
        hyper_util::client::legacy::Client::builder(hyper_util::rt::TokioExecutor::new())
            .build_http();

    let result = example2::http::operations::raw::freestanding(&mut client).await;

    match result {
        Ok(output) => {
            println!("output: {:?}", output);
        }
        Err(Error::Deserialize(err)) => {
            println!("deserialize error: {:?}", err);
        }
        Err(Error::Body(err)) => {
            println!("body error: {:?}", err);
        }
        Err(Error::Service(err)) => {
            println!("service error: {:?}", err);
        }
        Err(Error::Operation(err)) => {
            println!("operation error: {:?}", err);
        }
        Err(Error::UnexpectedStatus(response)) => {
            println!("unexpected status: {:?}", response);
        }
    }

    Ok(())
}
