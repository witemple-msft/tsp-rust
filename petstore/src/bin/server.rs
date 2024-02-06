#![feature(impl_trait_in_assoc_type)]

use hyper::server::conn::http1;
use hyper_util::rt::TokioIo;
use petstore::{router::PetStoreRouter, Pet};
use std::{collections::HashMap, net::SocketAddr, sync::Arc};
use tokio::{net::TcpListener, sync::Mutex};

#[derive(Clone)]
struct PetStore {
    pets: Arc<Mutex<HashMap<String, Pet>>>,
}

impl PetStore {
    fn new() -> Self {
        Self {
            pets: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

impl petstore::Pets for PetStore {
    type Error<OperationError> = std::convert::Infallible;

    async fn list(&mut self) -> Result<Vec<Pet>, Self::Error<::core::convert::Infallible>> {
        let pets = self.pets.lock().await;

        Ok(pets.values().cloned().collect())
    }

    async fn create(&mut self, pet: Pet) -> Result<Pet, Self::Error<::core::convert::Infallible>> {
        let mut pets = self.pets.lock().await;

        if pets.contains_key(&pet.name) {
            panic!("pet already exists");
        }

        pets.insert(pet.name.clone(), pet.clone());

        Ok(pet)
    }

    async fn update(
        &mut self,
        id: impl AsRef<str> + Send,
        pet: Pet,
    ) -> Result<Pet, Self::Error<::core::convert::Infallible>> {
        let mut pets = self.pets.lock().await;

        if !pets.contains_key(id.as_ref()) {
            panic!("pet does not exist");
        }

        pets.insert(id.as_ref().to_string(), pet.clone());

        Ok(pet)
    }

    async fn delete(
        &mut self,
        id: impl AsRef<str> + Send,
    ) -> Result<(), Self::Error<::core::convert::Infallible>> {
        let mut pets = self.pets.lock().await;

        if pets.remove(id.as_ref()).is_none() {
            panic!("pet does not exist");
        }

        Ok(())
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));

    let listener = TcpListener::bind(addr).await?;

    let petstore = PetStore::new();

    loop {
        let (stream, _) = listener.accept().await?;

        let io = TokioIo::new(stream);

        let petstore = petstore.clone();

        tokio::spawn(async move {
            if let Err(err) = http1::Builder::new()
                .serve_connection(
                    io,
                    hyper_util::service::TowerToHyperService::new(PetStoreRouter::new(petstore)),
                )
                .await
            {
                eprintln!("server error: {}", err);
            }
        });
    }
}
