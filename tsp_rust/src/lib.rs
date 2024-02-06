#![feature(decl_macro)]
#![feature(let_chains)]

use std::future::Future;

use linkme::distributed_slice;

#[distributed_slice]
static FEATURES: [&str];

#[cfg(feature = "http")]
#[distributed_slice(FEATURES)]
static HTTP_FEATURE: &str = "http";

pub mod vendored {
    pub use bigdecimal;
    pub use chrono;
    pub use futures;
    pub use itertools;
    pub use log;
    pub use serde;
    pub use serde_json;
    pub use serde_with;
    pub use thiserror;

    #[cfg(feature = "http")]
    pub use super::http::vendored::*;
}

pub trait OperationFuture<T, E>: Future<Output = Result<T, E>> + Send {}
impl<R: Future<Output = Result<T, E>> + Send, T, E> OperationFuture<T, E> for R {}

#[cfg(feature = "http")]
pub mod http {
    use std::{convert::Infallible, pin::Pin};

    use bytes::Bytes;
    use futures::Stream;
    use http_body::Frame;
    use http_body_util::StreamBody;
    use serde::{Deserialize, Serialize};

    use crate::serialize;

    pub mod vendored {
        pub use bytes;
        pub use eyes;
        pub use http;
        pub use http_body;
        pub use http_body_util;
        pub use reqwest;
        pub use tower;
        pub use url;
    }

    pub trait Service<ResponseBody: http_body::Body>:
        tower::Service<http::Request<Body>, Response = http::Response<ResponseBody>>
    {
    }
    impl<S, ResponseBody: http_body::Body> Service<ResponseBody> for S where
        S: tower::Service<http::Request<Body>, Response = http::Response<ResponseBody>>
    {
    }

    pub type Body =
        StreamBody<Pin<Box<dyn Stream<Item = Result<Frame<Bytes>, Infallible>> + Send + Sync>>>;

    #[derive(Debug)]
    pub enum Error<Body: http_body::Body, ServiceError, OperationError> {
        Serialize(serde_json::Error),
        Deserialize(serde_json::Error),
        Body(Body::Error),
        Service(ServiceError),
        Operation(OperationError),
        UnexpectedStatus(u16, http::response::Parts),
        UnexpectedContentType(Option<String>, http::response::Parts),
    }

    pub async fn send_request<ResponseBody: http_body::Body, S: Service<ResponseBody>, E>(
        service: &mut S,
        request: http::Request<Body>,
    ) -> Result<S::Response, Error<ResponseBody, S::Error, E>> {
        futures::future::poll_fn(|cx| service.poll_ready(cx))
            .await
            .map_err(Error::Service)?;

        service.call(request).await.map_err(Error::Service)
    }

    pub fn serialize_json_body<T: serde::Serialize>(body: T) -> Result<Body, serde_json::Error> {
        let data = serde_json::to_vec(&body)?;
        let stream = futures::stream::once(futures::future::ready(Ok(Frame::data(data.into()))));
        Ok(StreamBody::new(Box::pin(stream)))
    }

    pub async fn deserialize_body<
        T: for<'a> Deserialize<'a>,
        Body: http_body::Body,
        ServiceError,
        OperationError,
    >(
        body: Body,
    ) -> Result<T, Error<Body, ServiceError, OperationError>> {
        use http_body_util::BodyExt;

        let data = body.collect().await.map_err(Error::Body)?.to_bytes();

        serde_json::from_slice(&data).map_err(Error::Deserialize)
    }

    pub async fn deserialize_body_server<
        T: for<'a> Deserialize<'a>,
        Body: http_body::Body,
        OperationError: std::error::Error,
    >(
        body: Body,
    ) -> Result<T, ServerError<Body, OperationError>> {
        use http_body_util::BodyExt;

        let data = body.collect().await.map_err(ServerError::Body)?.to_bytes();

        serde_json::from_slice(&data).map_err(ServerError::Deserialize)
    }

    // TODO: return a result instead of panicking in FromParts/FromResponse
    pub trait FromParts {
        fn from_parts(parts: http::response::Parts) -> Self;
    }

    pub trait FromResponse<Body> {
        fn from_response(body: Body, parts: http::response::Parts) -> Self;
    }

    pub enum ServerError<B: http_body::Body, OperationError: std::error::Error> {
        InvalidRequest,
        Operation(OperationError),
        Serialize(serde_json::Error),
        Deserialize(serde_json::Error),
        Body(B::Error),
    }

    impl<B: http_body::Body, OperationError: std::error::Error> std::fmt::Debug
        for ServerError<B, OperationError>
    {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            match self {
                Self::InvalidRequest => write!(f, "InvalidRequest"),
                Self::Operation(arg0) => f.debug_tuple("Operation").field(arg0).finish(),
                Self::Serialize(arg0) => f.debug_tuple("Serialize").field(arg0).finish(),
                Self::Deserialize(arg0) => f.debug_tuple("Deserialize").field(arg0).finish(),
                Self::Body(_) => f.debug_tuple("Body").finish(),
            }
        }
    }

    impl<B: http_body::Body, OperationError: std::error::Error> std::error::Error
        for ServerError<B, OperationError>
    where
        B::Error: std::error::Error,
    {
    }

    impl<B: http_body::Body, OperationError: std::error::Error> core::fmt::Display
        for ServerError<B, OperationError>
    where
        B::Error: std::fmt::Display,
    {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            match self {
                ServerError::InvalidRequest => write!(f, "Invalid request"),
                ServerError::Operation(err) => write!(f, "Operation error: {}", err),
                ServerError::Serialize(err) => write!(f, "Serialize error: {}", err),
                ServerError::Deserialize(err) => write!(f, "Deserialize error: {}", err),
                ServerError::Body(err) => write!(f, "Body error: {}", err),
            }
        }
    }

    pub trait Responder {
        fn to_response<B: http_body::Body, E: std::error::Error>(
            self,
        ) -> Result<http::Response<Body>, ServerError<B, E>>;
    }

    impl<T: Responder, E: Responder> Responder for Result<T, E> {
        fn to_response<B: http_body::Body, Err: std::error::Error>(
            self,
        ) -> Result<http::Response<Body>, ServerError<B, Err>> {
            match self {
                Ok(t) => t.to_response(),
                Err(e) => e.to_response(),
            }
        }
    }

    impl FromParts for () {
        fn from_parts(_: http::response::Parts) -> Self {
            #[allow(clippy::unused_unit)]
            ()
        }
    }

    impl Responder for () {
        fn to_response<B: http_body::Body, E: std::error::Error>(
            self,
        ) -> Result<http::Response<Body>, ServerError<B, E>> {
            Ok(http::Response::builder()
                .status(http::StatusCode::NO_CONTENT)
                .body(Body::new(Box::pin(futures::stream::empty())))
                .unwrap())
        }
    }

    impl<T: Serialize> Responder for Vec<T> {
        fn to_response<B: http_body::Body, E: std::error::Error>(
            self,
        ) -> Result<http::Response<Body>, ServerError<B, E>> {
            Ok(http::Response::builder()
                .status(http::StatusCode::OK)
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(serialize_json_body(self).map_err(ServerError::Serialize)?)
                .unwrap())
        }
    }
}

pub mod serialize {
    pub mod null_variant {
        pub fn serialize<S>(serializer: S) -> Result<S::Ok, S::Error>
        where
            S: serde::Serializer,
        {
            serializer.serialize_none()
        }

        pub fn deserialize<'de, D>(deserializer: D) -> Result<(), D::Error>
        where
            D: serde::Deserializer<'de>,
        {
            struct NullVariantVisitor;

            impl<'de> serde::de::Visitor<'de> for NullVariantVisitor {
                type Value = ();

                fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                    formatter.write_str("null")
                }

                fn visit_none<E>(self) -> Result<Self::Value, E>
                where
                    E: serde::de::Error,
                {
                    Ok(())
                }

                fn visit_unit<E>(self) -> Result<Self::Value, E>
                where
                    E: serde::de::Error,
                {
                    Ok(())
                }
            }

            deserializer.deserialize_option(NullVariantVisitor)
        }
    }
}

pub mod build {
    use std::io::BufRead;

    use itertools::Itertools;

    pub fn build_tsp(config: &str, main_file: &str, out_file: &str) {
        // Make a tempdir
        let tempdir = tempdir::TempDir::new("tsp-rust").unwrap();

        let output_dir = tempdir.path().join("tsp-output");

        // resolve main_file
        let canonical = std::fs::canonicalize(main_file).unwrap();
        let main_file = canonical.to_str().unwrap().to_string();

        // Cd to ../ and then run `tsp compile ./main.tsp`
        let output = std::process::Command::new("tsp")
            .arg("--config")
            .arg(config)
            .arg("compile")
            .arg(main_file.clone())
            .arg("--output-dir")
            .arg(output_dir.clone())
            .output()
            .expect("Failed to run tsp, is it installed?");

        let mut visited = std::collections::HashSet::new();
        visited.insert(main_file.clone());

        let mut file_queue = vec![main_file];

        // Breadth-first search the file_queue, reading each file and adding the files it imports
        // to the file_queue

        while let Some(path) = file_queue.pop() {
            // rerun-if-changed on this file

            // path is absolute, but we want to emit a relative path from cwd to that path
            // it could be anywhere so we need to possibly go up a few directories
            let cwd = std::env::current_dir().unwrap();
            let cwd_segments = cwd.components().collect::<Vec<_>>();
            let path_segments = std::path::Path::new(&path).components().collect::<Vec<_>>();

            // Find the number of common prefix elements between cwd and path segments
            let mut common_prefix = 0;
            // The prefixes may not be the same length so we can't just use zip
            while common_prefix < cwd_segments.len()
                && common_prefix < path_segments.len()
                && cwd_segments[common_prefix] == path_segments[common_prefix]
            {
                common_prefix += 1;
            }

            // The relative path is the number of segments in cwd that we need to go up, plus the
            // remaining segments in path
            let mut cwd_relative_path = String::new();
            for _ in common_prefix..cwd_segments.len() {
                cwd_relative_path.push_str("../");
            }
            let path_joined = path_segments[common_prefix..]
                .iter()
                .map(|s| s.as_os_str().to_str().unwrap())
                .join("/");

            cwd_relative_path.push_str(&path_joined);

            println!("cargo:rerun-if-changed={}", cwd_relative_path);

            let file = std::fs::File::open(&path).unwrap();
            let reader = std::io::BufReader::new(file);

            for line in reader.lines().filter_map(|l| {
                if let Ok(l) = l
                    && l.starts_with("import")
                {
                    Some(l)
                } else {
                    None
                }
            }) {
                // import<WS_OPT>"<import_path>"<WS_OPT>;
                let import_path_end_fragment = line.split_once('"').unwrap().1;

                // split once from the end of import_path_end_fragment and the first part is import_path,
                // but the import path might contain an escaped quote so we can't just split_once
                let index_last_quote = import_path_end_fragment.rfind('"').unwrap();
                let import_path = import_path_end_fragment[..index_last_quote].to_string();

                // The paths are like node modules, so there are a few cases:
                // 1. relative path, starts with .
                // 2. starts with @, so it's a scoped package
                // 3. starts with a letter, so it's a package in the npm registry
                // 4. starts with a /, so it's an absolute path

                // We only enqueue the file if it is a path to a file with a .tsp extension
                if import_path.ends_with(".tsp")
                    && (import_path.starts_with('/') || import_path.starts_with('.'))
                {
                    let next_path = if import_path.starts_with('/') {
                        // Absolute path
                        std::path::PathBuf::from(&import_path)
                    } else {
                        // Relative path
                        let mut path_buf = std::path::PathBuf::from(&path);
                        path_buf.pop();
                        path_buf.push(&import_path);
                        // canonicalize
                        std::fs::canonicalize(path_buf).unwrap()
                    };

                    let next_path_str = next_path.to_str().unwrap().to_string();

                    if !visited.contains(&next_path_str) {
                        visited.insert(next_path_str.clone());
                        file_queue.push(next_path_str);
                    }
                }
            }
        }

        if !output.status.success() {
            eprintln!("{}", String::from_utf8_lossy(&output.stderr));
            panic!(
                "Failed to run tsp: {}",
                String::from_utf8_lossy(&output.stdout)
            );
        }

        // Copy ../tsp-output/tsp-rust/output.rs to OUT_DIR
        let out_dir = std::env::var("OUT_DIR").unwrap();

        let output_rs = std::path::Path::new(&out_dir).join(out_file);

        // Copy from the temp dir to output_rs
        std::fs::copy(output_dir.join("tsp-rust").join("output.rs"), output_rs).unwrap();
    }

    #[cfg(debug_assertions)]
    pub mod __dev {
        use std::path::PathBuf;

        /// Watches the JS files in the emitter directory. The root parameter is
        /// where to look for the emitter directory.
        pub fn spit_cargo_watch_js(root: PathBuf) {
            // Outputs are located in the `dist` folder under the root.
            let output_dir = root.join("dist");

            // We'll do a simple breadth-first search
            let mut dir_queue = vec![output_dir];

            while let Some(dir) = dir_queue.pop() {
                for entry in std::fs::read_dir(dir).unwrap() {
                    let entry = entry.unwrap();
                    let path = entry.path();

                    if path.is_dir() {
                        dir_queue.push(path);
                    } else if let Some("js") = path.extension().map(|v| v.to_str().unwrap()) {
                        println!("cargo:rerun-if-changed={}", path.to_str().unwrap());
                    }
                }
            }
        }
    }
}
