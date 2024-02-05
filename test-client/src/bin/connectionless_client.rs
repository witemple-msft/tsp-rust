use test_client::server::{MainService, MainServiceRouter};
use tsp_rust::http::Error;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Pass the instance of MainServiceRouter directly into the raw client functions.
    // This allows us to test the client without a TCP connection. The data will still be
    // marshalled through the HTTP layer, but not through the actual HTTP wire protocol.
    let mut service = MainServiceRouter::new(MainService);

    let result = test_client::example::http::operations::client_raw::freestanding_path(
        &mut service,
        "asdfasdf",
        "coolquery",
    )
    .await;

    match result {
        Ok(output) => {
            println!("output: {:?}", output);
        }
        Err(Error::Serialize(err)) => {
            println!("serialize error: {:?}", err);
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
        Err(Error::UnexpectedStatus(status, response)) => {
            println!("unexpected status {}: {:?}", status, response);
        }
        Err(Error::UnexpectedContentType(content_type, response)) => {
            println!(
                "unexpected content type '{:?}': {:?}",
                content_type, response
            );
        }
    }

    Ok(())
}
