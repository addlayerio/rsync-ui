use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

use chrono::Local;
use tauri::async_runtime::JoinHandle;
use tokio::sync::Notify;
use uuid::Uuid;

use crate::models::{RunRecord, Store};

/// Shared application state managed by Tauri.
pub struct AppState {
    /// Directory where `store.json` and the `logs/` folder live.
    pub data_dir: PathBuf,
    pub logs_dir: PathBuf,
    /// The persisted store (tasks, run history, settings).
    pub store: Mutex<Store>,
    /// Scheduler jobs keyed by task id.
    pub jobs: Mutex<HashMap<String, JoinHandle<()>>>,
    /// Currently running rsync processes keyed by run id; the `Notify` is used
    /// to request cancellation.
    pub running: Mutex<HashMap<String, Arc<Notify>>>,
    /// Whether the system-tray icon was created successfully. When false (e.g.
    /// no appindicator library available), close-to-tray is disabled so the
    /// window can't become unreachable.
    pub tray_available: AtomicBool,
}

pub fn now_iso() -> String {
    Local::now().to_rfc3339()
}

pub fn new_uuid() -> String {
    Uuid::new_v4().to_string()
}

/// Serialize the store to disk (pretty JSON). Never panics.
pub fn write_store(store: &Store, data_dir: &Path) {
    let path = data_dir.join("store.json");
    if let Ok(json) = serde_json::to_string_pretty(store) {
        let _ = std::fs::write(path, json);
    }
}

/// Keep at most `max` run records (newest first).
pub fn cap_runs(runs: &mut Vec<RunRecord>, max: usize) {
    if runs.len() > max {
        runs.truncate(max);
    }
}
