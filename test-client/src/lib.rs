#![feature(impl_trait_in_assoc_type)]

pub mod example;

pub mod server {
    use std::{convert::Infallible, future::Future, task::Poll};

    use tsp_rust::vendored::tower::Service;

    use crate::example::{
        self,
        models::{
            all::Example,
            synthetic::{FreestandingPathResponse, FreestandingResponse},
        },
    };

    #[derive(Clone)]
    pub struct MainService;

    impl example::models::all::Example for MainService {
        type Error<OperationError> = Infallible;

        async fn freestanding(
            &mut self,
            foo: impl AsRef<str> + Send,
        ) -> Result<
            example::models::synthetic::FreestandingResponse,
            Self::Error<example::models::all::example::Error>,
        > {
            Ok(FreestandingResponse {
                bar: format!("{}bar", foo.as_ref()),
                example: vec![0, 1, 2, 3, 4, 5, 6, 7],
            })
        }

        async fn freestanding_path(
            &mut self,
            id: impl AsRef<str>,
            q: impl AsRef<str>,
        ) -> Result<
            example::models::synthetic::FreestandingPathResponse,
            Self::Error<example::models::all::example::Error>,
        > {
            Ok(FreestandingPathResponse {
                composite: format!("{}-{}", id.as_ref(), q.as_ref()),
                example: vec![0, 1, 2, 3, 4, 5, 6, 7],
            })
        }
    }

    #[derive(Clone)]
    pub struct MainServiceRouter<E: Example + Clone> {
        service: E,
        routes: matchit::Router<usize>,
    }

    impl<E: Example + Clone> MainServiceRouter<E> {
        pub fn new(service: E) -> Self {
            let mut routes = matchit::Router::new();
            routes.insert("/freestanding", 0).unwrap();
            routes.insert("/freestanding/:id", 1).unwrap();

            Self { service, routes }
        }
    }

    impl<
            E: Example + Clone + Send,
            RequestBody: ::tsp_rust::vendored::http_body::Body + Send + Sync + 'static,
        > Service<::tsp_rust::vendored::http::Request<RequestBody>> for MainServiceRouter<E>
    where
        <RequestBody as ::tsp_rust::vendored::http_body::Body>::Error:
            std::error::Error + Send + Sync,
    {
        type Response = ::tsp_rust::vendored::http::Response<::tsp_rust::http::Body>;

        type Error = anyhow::Error;

        type Future = impl Future<Output = Result<Self::Response, Self::Error>> + Send;

        fn poll_ready(
            &mut self,
            _cx: &mut std::task::Context<'_>,
        ) -> std::task::Poll<Result<(), Self::Error>> {
            Poll::Ready(Ok(()))
        }

        fn call(&mut self, req: ::tsp_rust::vendored::http::Request<RequestBody>) -> Self::Future {
            let route = self.routes.at(req.uri().path()).map(|r| *r.value);
            let svc = self.service.clone();

            async move {
                let Ok(route) = route else {
                    return Err(anyhow::anyhow!("not found"));
                };

                match route {
                    0 => example::http::operations::server_raw::freestanding(svc, req)
                        .await
                        .map_err(Into::into),
                    1 => example::http::operations::server_raw::freestanding_path(svc, req)
                        .await
                        .map_err(Into::into),
                    _ => Err(anyhow::anyhow!("not found")),
                }
            }
        }
    }
}
