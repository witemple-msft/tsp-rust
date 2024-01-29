use actix_web::{get, App, HttpResponse, HttpServer, Responder};

#[get("/freestanding")]
async fn greet() -> impl Responder {
    HttpResponse::Ok()
        .content_type("application/json")
        .body(r#"{"example":[0,1,2,3,4,5,6,7]}"#)
}

#[actix_web::main] // or #[tokio::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().service(greet))
        .bind(("127.0.0.1", 8080))?
        .run()
        .await
}
