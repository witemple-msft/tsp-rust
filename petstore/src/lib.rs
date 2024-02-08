#![feature(impl_trait_in_assoc_type)]

mod generated;

pub use generated::*;

pub mod petstore_logic {
    use super::{Pet, Pets};
    use std::{collections::HashMap, sync::Arc};
    use tokio::sync::Mutex;

    #[derive(Clone, Default)]
    pub struct PetStore {
        pets: Arc<Mutex<HashMap<String, Pet>>>,
    }

    impl PetStore {
        pub fn new() -> Self {
            Self {
                pets: Arc::new(Mutex::new(HashMap::new())),
            }
        }
    }

    impl Pets for PetStore {
        type Error<OperationError> = std::convert::Infallible;

        async fn list(&mut self) -> Result<Vec<Pet>, Self::Error<::core::convert::Infallible>> {
            let pets = self.pets.lock().await;

            Ok(pets.values().cloned().collect())
        }

        async fn create(
            &mut self,
            pet: Pet,
        ) -> Result<Pet, Self::Error<::core::convert::Infallible>> {
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
}
