use std::{future::Future, task::Poll};

use tsp_rust::vendored::tower::Service;

use crate::{http::operations::server_raw, Pets};

#[derive(Clone)]
pub struct PetStoreRouter<P: Pets + Clone> {
    service: P,
    routes: matchit::Router<usize>,
}

impl<P: Pets + Clone> PetStoreRouter<P> {
    pub fn new(service: P) -> Self {
        let mut routes = matchit::Router::new();

        routes.insert("/pets", 0).unwrap();
        routes.insert("/pets/:id", 1).unwrap();

        Self { service, routes }
    }
}

impl<
        P: Pets + Clone + Send,
        RequestBody: ::tsp_rust::vendored::http_body::Body + Send + Sync + 'static,
    > Service<::tsp_rust::vendored::http::Request<RequestBody>> for PetStoreRouter<P>
where
    <RequestBody as ::tsp_rust::vendored::http_body::Body>::Error: std::error::Error + Send + Sync,
    <RequestBody as ::tsp_rust::vendored::http_body::Body>::Data: Send + Sync,
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
                0 => match req.method().clone() {
                    ::tsp_rust::vendored::http::Method::GET => {
                        server_raw::list(svc, req).await.map_err(Into::into)
                    }
                    ::tsp_rust::vendored::http::Method::POST => {
                        server_raw::create(svc, req).await.map_err(Into::into)
                    }
                    _ => Err(anyhow::anyhow!("not found")),
                },
                1 => match req.method().clone() {
                    ::tsp_rust::vendored::http::Method::POST => {
                        server_raw::update(svc, req).await.map_err(Into::into)
                    }
                    ::tsp_rust::vendored::http::Method::DELETE => {
                        server_raw::delete(svc, req).await.map_err(Into::into)
                    }
                    _ => Err(anyhow::anyhow!("not found")),
                },
                _ => Err(anyhow::anyhow!("not found")),
            }
        }
    }
}
