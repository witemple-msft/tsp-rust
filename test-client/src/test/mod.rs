// Generated by Microsoft TypeSpec

pub mod models {
    pub mod all {
        /// This is a sample CRUD pet store service.
        pub mod pet_store {
            #[derive(
                Debug,
                Clone,
                PartialEq,
                ::tsp_rust::vendored::serde::Deserialize,
                ::tsp_rust::vendored::serde::Serialize,
            )]
            #[serde(crate = "::tsp_rust::vendored::serde")]
            pub struct Pet {
                pub name: String,

                pub age: i32,

                pub kind: super::super::synthetic::PetKind,
            }

            pub trait Pets {
                /// The error type which may be returned by this trait's operations.
                type Error<OperationError>: std::error::Error + Send + Sync + 'static;

                fn list(
                    &mut self,
                ) -> impl ::tsp_rust::OperationFuture<Vec<Pet>, Self::Error<::core::convert::Infallible>>;

                fn create(
                    &mut self,
                    pet: Pet,
                ) -> impl ::tsp_rust::OperationFuture<Pet, Self::Error<::core::convert::Infallible>>;

                fn update(
                    &mut self,
                    id: impl AsRef<str> + Send,
                    pet: Pet,
                ) -> impl ::tsp_rust::OperationFuture<Pet, Self::Error<::core::convert::Infallible>>;

                fn delete(
                    &mut self,
                    id: impl AsRef<str> + Send,
                ) -> impl ::tsp_rust::OperationFuture<(), Self::Error<::core::convert::Infallible>>;
            }
        }
    }

    pub mod synthetic {
        #[derive(
            Debug,
            Clone,
            PartialEq,
            ::tsp_rust::vendored::serde::Deserialize,
            ::tsp_rust::vendored::serde::Serialize,
        )]
        #[serde(crate = "::tsp_rust::vendored::serde")]
        #[serde(untagged)]

        pub enum PetKind {
            #[serde(rename = "dog")]
            Dog,

            #[serde(rename = "cat")]
            Cat,

            #[serde(rename = "fish")]
            Fish,
        }
    }
}

pub mod http {
    pub mod operations {
        pub mod client_raw {
            #[allow(unused)]
            pub async fn list<
                ResponseBody: ::tsp_rust::vendored::http_body::Body,
                S: ::tsp_rust::http::Service<ResponseBody>,
            >(
                service: &mut S,
            ) -> Result<
                Vec<super::super::super::models::all::pet_store::Pet>,
                ::tsp_rust::http::Error<ResponseBody, S::Error, ::core::convert::Infallible>,
            > {
                use ::tsp_rust::http::Error as HttpError;

                let request = ::tsp_rust::vendored::http::Request::builder()
                    .method(::tsp_rust::vendored::http::Method::GET)
                    .uri("/pets")
                    .body(::tsp_rust::http::Body::new(Box::pin(
                        ::tsp_rust::vendored::futures::stream::empty(),
                    )))
                    .unwrap();

                let response = ::tsp_rust::http::send_request(service, request).await?;
                #[allow(unused_variables)]
                let (parts, body) = response.into_parts();

                let status_code = parts.status.as_u16();

                let content_type = parts
                    .headers
                    .get("content-type")
                    .map(|h| {
                        String::from(
                            h.to_str()
                                .expect("failed to convert header contents to String"),
                        )
                    })
                    .ok_or_else(|| {
                        ::tsp_rust::http::Error::UnexpectedContentType(None, parts.clone())
                    })?;

                match status_code {
                    200 => match content_type.as_str() {
                        "application/json" => {
                            let body: Vec<super::super::super::models::all::pet_store::Pet> =
                                ::tsp_rust::http::deserialize_body(body).await?;

                            Ok(body)
                        }
                        _ => Err(HttpError::UnexpectedContentType(Some(content_type), parts)),
                    },
                    code => Err(HttpError::UnexpectedStatus(code, parts)),
                }
            }

            #[allow(unused)]
            pub async fn create<
                ResponseBody: ::tsp_rust::vendored::http_body::Body,
                S: ::tsp_rust::http::Service<ResponseBody>,
            >(
                service: &mut S,
                pet: super::super::super::models::all::pet_store::Pet,
            ) -> Result<
                super::super::super::models::all::pet_store::Pet,
                ::tsp_rust::http::Error<ResponseBody, S::Error, ::core::convert::Infallible>,
            > {
                use ::tsp_rust::http::Error as HttpError;

                let request = ::tsp_rust::vendored::http::Request::builder()
                    .method(::tsp_rust::vendored::http::Method::POST)
                    .uri("/pets")
                    .header("content-type", "application/json")
                    .body(::tsp_rust::http::Body::new(Box::pin(
                        ::tsp_rust::vendored::futures::stream::once(
                            ::tsp_rust::vendored::futures::future::ready(Ok(
                                ::tsp_rust::vendored::http_body::Frame::data(
                                    ::tsp_rust::vendored::serde_json::to_vec(&pet)
                                        .map_err(HttpError::Serialize)?
                                        .into(),
                                ),
                            )),
                        ),
                    )))
                    .unwrap();

                let response = ::tsp_rust::http::send_request(service, request).await?;
                #[allow(unused_variables)]
                let (parts, body) = response.into_parts();

                let status_code = parts.status.as_u16();

                let content_type = parts
                    .headers
                    .get("content-type")
                    .map(|h| {
                        String::from(
                            h.to_str()
                                .expect("failed to convert header contents to String"),
                        )
                    })
                    .ok_or_else(|| {
                        ::tsp_rust::http::Error::UnexpectedContentType(None, parts.clone())
                    })?;

                match status_code {
                    200 => match content_type.as_str() {
                        "application/json" => {
                            let body: super::super::super::models::all::pet_store::Pet =
                                ::tsp_rust::http::deserialize_body(body).await?;

                            Ok(body)
                        }
                        _ => Err(HttpError::UnexpectedContentType(Some(content_type), parts)),
                    },
                    code => Err(HttpError::UnexpectedStatus(code, parts)),
                }
            }

            #[allow(unused)]
            pub async fn update<
                ResponseBody: ::tsp_rust::vendored::http_body::Body,
                S: ::tsp_rust::http::Service<ResponseBody>,
            >(
                service: &mut S,
                id: impl AsRef<str> + Send,
                pet: super::super::super::models::all::pet_store::Pet,
            ) -> Result<
                super::super::super::models::all::pet_store::Pet,
                ::tsp_rust::http::Error<ResponseBody, S::Error, ::core::convert::Infallible>,
            > {
                use ::tsp_rust::http::Error as HttpError;

                let request = ::tsp_rust::vendored::http::Request::builder()
                    .method(::tsp_rust::vendored::http::Method::POST)
                    .uri(format!("/pets/{}", ToString::to_string(id.as_ref())))
                    .header("content-type", "application/json")
                    .body(::tsp_rust::http::Body::new(Box::pin(
                        ::tsp_rust::vendored::futures::stream::once(
                            ::tsp_rust::vendored::futures::future::ready(Ok(
                                ::tsp_rust::vendored::http_body::Frame::data(
                                    ::tsp_rust::vendored::serde_json::to_vec(&pet)
                                        .map_err(HttpError::Serialize)?
                                        .into(),
                                ),
                            )),
                        ),
                    )))
                    .unwrap();

                let response = ::tsp_rust::http::send_request(service, request).await?;
                #[allow(unused_variables)]
                let (parts, body) = response.into_parts();

                let status_code = parts.status.as_u16();

                let content_type = parts
                    .headers
                    .get("content-type")
                    .map(|h| {
                        String::from(
                            h.to_str()
                                .expect("failed to convert header contents to String"),
                        )
                    })
                    .ok_or_else(|| {
                        ::tsp_rust::http::Error::UnexpectedContentType(None, parts.clone())
                    })?;

                match status_code {
                    200 => match content_type.as_str() {
                        "application/json" => {
                            let body: super::super::super::models::all::pet_store::Pet =
                                ::tsp_rust::http::deserialize_body(body).await?;

                            Ok(body)
                        }
                        _ => Err(HttpError::UnexpectedContentType(Some(content_type), parts)),
                    },
                    code => Err(HttpError::UnexpectedStatus(code, parts)),
                }
            }

            #[allow(unused)]
            pub async fn delete<
                ResponseBody: ::tsp_rust::vendored::http_body::Body,
                S: ::tsp_rust::http::Service<ResponseBody>,
            >(
                service: &mut S,
                id: impl AsRef<str> + Send,
            ) -> Result<
                (),
                ::tsp_rust::http::Error<ResponseBody, S::Error, ::core::convert::Infallible>,
            > {
                use ::tsp_rust::http::Error as HttpError;

                let request = ::tsp_rust::vendored::http::Request::builder()
                    .method(::tsp_rust::vendored::http::Method::GET)
                    .uri(format!("/pets/{}", ToString::to_string(id.as_ref())))
                    .body(::tsp_rust::http::Body::new(Box::pin(
                        ::tsp_rust::vendored::futures::stream::empty(),
                    )))
                    .unwrap();

                let response = ::tsp_rust::http::send_request(service, request).await?;
                #[allow(unused_variables)]
                let (parts, body) = response.into_parts();

                let status_code = parts.status.as_u16();

                match status_code {
                    204 => Ok(::tsp_rust::http::FromParts::from_parts(parts)),
                    code => Err(HttpError::UnexpectedStatus(code, parts)),
                }
            }
        }

        pub mod server_raw {
            pub async fn list<
                E: super::super::super::models::all::pet_store::Pets,
                RequestBody: ::tsp_rust::vendored::http_body::Body + Send + Sync,
            >(
                mut service: E,
                request: ::tsp_rust::vendored::http::Request<RequestBody>,
            ) -> Result<
                ::tsp_rust::vendored::http::Response<::tsp_rust::http::Body>,
                ::tsp_rust::http::ServerError<RequestBody, E::Error<::core::convert::Infallible>>,
            > {
                #[allow(unused_variables)]
                let (parts, body) = request.into_parts();

                let result = service
                    .list()
                    .await
                    .map_err(::tsp_rust::http::ServerError::Operation)?;

                ::tsp_rust::http::Responder::to_response(result)
            }

            pub async fn create<
                E: super::super::super::models::all::pet_store::Pets,
                RequestBody: ::tsp_rust::vendored::http_body::Body + Send + Sync,
            >(
                mut service: E,
                request: ::tsp_rust::vendored::http::Request<RequestBody>,
            ) -> Result<
                ::tsp_rust::vendored::http::Response<::tsp_rust::http::Body>,
                ::tsp_rust::http::ServerError<RequestBody, E::Error<::core::convert::Infallible>>,
            > {
                #[allow(unused_variables)]
                let (parts, body) = request.into_parts();

                let pet = ::tsp_rust::http::deserialize_body_server(body).await?;

                let result = service
                    .create(pet)
                    .await
                    .map_err(::tsp_rust::http::ServerError::Operation)?;

                ::tsp_rust::http::Responder::to_response(result)
            }

            pub async fn update<
                E: super::super::super::models::all::pet_store::Pets,
                RequestBody: ::tsp_rust::vendored::http_body::Body + Send + Sync,
            >(
                mut service: E,
                request: ::tsp_rust::vendored::http::Request<RequestBody>,
            ) -> Result<
                ::tsp_rust::vendored::http::Response<::tsp_rust::http::Body>,
                ::tsp_rust::http::ServerError<RequestBody, E::Error<::core::convert::Infallible>>,
            > {
                #[allow(unused_variables)]
                let (parts, body) = request.into_parts();

                #[allow(unused_parens)]
                let (id) = ::tsp_rust::vendored::eyes::parse!(parts.uri.path(), "/pets/{}", String);

                let pet = ::tsp_rust::http::deserialize_body_server(body).await?;

                let result = service
                    .update(id, pet)
                    .await
                    .map_err(::tsp_rust::http::ServerError::Operation)?;

                ::tsp_rust::http::Responder::to_response(result)
            }

            pub async fn delete<
                E: super::super::super::models::all::pet_store::Pets,
                RequestBody: ::tsp_rust::vendored::http_body::Body + Send + Sync,
            >(
                mut service: E,
                request: ::tsp_rust::vendored::http::Request<RequestBody>,
            ) -> Result<
                ::tsp_rust::vendored::http::Response<::tsp_rust::http::Body>,
                ::tsp_rust::http::ServerError<RequestBody, E::Error<::core::convert::Infallible>>,
            > {
                #[allow(unused_variables)]
                let (parts, body) = request.into_parts();

                #[allow(unused_parens)]
                let (id) = ::tsp_rust::vendored::eyes::parse!(parts.uri.path(), "/pets/{}", String);

                let result = service
                    .delete(id)
                    .await
                    .map_err(::tsp_rust::http::ServerError::Operation)?;

                ::tsp_rust::http::Responder::to_response(result)
            }
        }
    }

    mod _impls {

        impl ::tsp_rust::http::Responder for super::super::models::all::pet_store::Pet {
            fn to_response<B: ::tsp_rust::vendored::http_body::Body, E: std::error::Error>(
                self,
            ) -> Result<
                ::tsp_rust::vendored::http::Response<::tsp_rust::http::Body>,
                ::tsp_rust::http::ServerError<B, E>,
            > {
                let response = ::tsp_rust::vendored::http::Response::builder()
                    .status(200u16)
                    .body(::tsp_rust::http::Body::new(Box::pin(
                        ::tsp_rust::vendored::futures::stream::empty(),
                    )))
                    .unwrap();

                Ok(response)
            }
        }
    }
}

#[allow(unused_imports)]
pub use models::all::pet_store::*;
