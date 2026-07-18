use std::path::Path;

use tauri::{AppHandle, Manager};

use crate::models::Store;
use crate::state::{write_store, AppState};

/// Load the store from disk, tolerating a missing or corrupt file.
pub fn load(data_dir: &Path) -> Store {
    let path = data_dir.join("store.json");
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Store::default(),
    }
}

/// On startup, any run still marked "running" belonged to a previous process
/// that was killed/crashed; flip it to "interrupted" so the UI is consistent.
pub fn reconcile_stale(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut store = state.store.lock().unwrap();
    let mut changed = false;
    for run in store.runs.iter_mut() {
        if run.status == "running" {
            run.status = "interrupted".into();
            changed = true;
        }
    }
    if changed {
        write_store(&store, &state.data_dir);
    }
}
