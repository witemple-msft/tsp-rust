#![feature(decl_macro)]

pub mod vendored {
    pub use chrono;
    pub use itertools;
    pub use reqwest;
    pub use serde;
    pub use serde_json;
    pub use thiserror;
}

pub trait QueryString {
    fn query_string(&self) -> String;
}

pub trait HeaderMap {
    fn header_map(&self) -> reqwest::header::HeaderMap;
}

pub type OperationResult<Body, Error> = Result<OperationResponse<Body>, OperationError<Error>>;

pub struct OperationResponse<Body> {
    pub body: Body,
    pub headers: reqwest::header::HeaderMap,
}

#[derive(thiserror::Error, Debug)]
pub enum OperationError<E: core::fmt::Debug> {
    #[error("Service error {0}: {1:?}")]
    Service(u16, E),
    #[error(transparent)]
    Transport(#[from] reqwest::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("Unknown error: {0:?}")]
    Unknown(Box<dyn std::error::Error + Send + Sync + 'static>),
}

pub macro options($t:ident { $($name:ident : $e:expr),*$(,)? }) {
    $t {
        $($name: Some($e),)+
        ..Default::default()
    }
}
