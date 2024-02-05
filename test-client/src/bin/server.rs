use actix_web::{
    get, post,
    web::{Path, Query},
    App, HttpRequest, HttpResponse, HttpServer, Responder,
};
use tsp_rust::vendored::serde::Deserialize;

#[get("/freestanding")]
async fn greet(req: HttpRequest) -> impl Responder {
    let Some(foo) = req.headers().get("X-Foo").map(|h| h.to_str().unwrap()) else {
        return HttpResponse::BadRequest().finish();
    };

    HttpResponse::Ok()
        .content_type("application/json")
        .append_header(("X-Bar", format!("{}bar", foo)))
        .body(r#"[0,1,2,3,4,5,6,7]"#)
}

#[derive(Deserialize)]
#[serde(crate = "::tsp_rust::vendored::serde")]
struct QueryParams {
    q: String,
}

#[post("/freestanding/{id}")]
async fn freestanding_path(id: Path<String>, query: Query<QueryParams>) -> impl Responder {
    HttpResponse::Ok()
        .content_type("application/json")
        .append_header(("X-Composite", format!("{}-{}", id, query.q)))
        .body(r#"[0,1,2,3,4,5,6,7]"#)
}

#[actix_web::main] // or #[tokio::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().service(greet).service(freestanding_path))
        .bind(("127.0.0.1", 8080))?
        .run()
        .await
}
