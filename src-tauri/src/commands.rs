use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::models::{RsyncInfo, RsyncTask, RunRecord, Settings};
use crate::rsync;
use crate::runner;
use crate::scheduler;
use crate::state::{new_uuid, now_iso, write_store, AppState};

#[tauri::command]
pub fn list_tasks(state: State<AppState>) -> Vec<RsyncTask> {
    state.store.lock().unwrap().tasks.clone()
}

#[tauri::command]
pub fn get_task(state: State<AppState>, id: String) -> Option<RsyncTask> {
    state
        .store
        .lock()
        .unwrap()
        .tasks
        .iter()
        .find(|t| t.id == id)
        .cloned()
}

#[tauri::command]
pub fn save_task(app: AppHandle, mut task: RsyncTask) -> Result<RsyncTask, String> {
    if task.name.trim().is_empty() {
        return Err("Task name is required".to_string());
    }

    let state = app.state::<AppState>();
    let saved = {
        let mut store = state.store.lock().unwrap();
        let now = now_iso();

        if task.id.trim().is_empty() {
            task.id = new_uuid();
            task.created_at = now.clone();
            task.updated_at = now;
            store.tasks.push(task.clone());
        } else if let Some(existing) = store.tasks.iter_mut().find(|t| t.id == task.id) {
            task.created_at = existing.created_at.clone();
            task.updated_at = now;
            *existing = task.clone();
        } else {
            // Unknown id: treat as a new record but keep the id.
            task.created_at = now.clone();
            task.updated_at = now;
            store.tasks.push(task.clone());
        }

        write_store(&store, &state.data_dir);
        task.clone()
    };

    scheduler::reschedule_task(&app, &saved);
    Ok(saved)
}

#[tauri::command]
pub fn delete_task(app: AppHandle, id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let removed_run_ids: Vec<String> = {
        let mut store = state.store.lock().unwrap();
        store.tasks.retain(|t| t.id != id);
        let ids: Vec<String> = store
            .runs
            .iter()
            .filter(|r| r.task_id == id)
            .map(|r| r.id.clone())
            .collect();
        store.runs.retain(|r| r.task_id != id);
        write_store(&store, &state.data_dir);
        ids
    };

    scheduler::unschedule(&app, &id);

    for run_id in removed_run_ids {
        let _ = std::fs::remove_file(state.logs_dir.join(format!("{run_id}.log")));
    }
    Ok(())
}

#[tauri::command]
pub fn run_task(app: AppHandle, id: String, dry_run: Option<bool>) -> Result<String, String> {
    runner::start_run(&app, &id, "manual", dry_run)
}

#[tauri::command]
pub fn cancel_run(app: AppHandle, run_id: String) -> Result<(), String> {
    runner::cancel(&app, &run_id)
}

#[tauri::command]
pub fn preview_command(task: RsyncTask, dry_run: Option<bool>) -> String {
    let dry = dry_run.unwrap_or(false);
    let args = rsync::build_args(&task, dry);
    rsync::preview("rsync", &args)
}

/// Parse a raw `rsync ...` command line into a task (options + source + dest).
#[tauri::command]
pub fn parse_command(command: String) -> Result<RsyncTask, String> {
    if command.trim().is_empty() {
        return Err("Command is empty".to_string());
    }
    Ok(rsync::parse_command(&command))
}

#[tauri::command]
pub fn list_runs(state: State<AppState>, task_id: Option<String>) -> Vec<RunRecord> {
    let store = state.store.lock().unwrap();
    match task_id {
        Some(id) => store
            .runs
            .iter()
            .filter(|r| r.task_id == id)
            .cloned()
            .collect(),
        None => store.runs.clone(),
    }
}

#[tauri::command]
pub fn get_run_log(state: State<AppState>, run_id: String) -> String {
    let path = state.logs_dir.join(format!("{run_id}.log"));
    std::fs::read_to_string(path).unwrap_or_default()
}

#[tauri::command]
pub fn clear_runs(state: State<AppState>, task_id: Option<String>) -> Result<(), String> {
    let mut store = state.store.lock().unwrap();
    let removed: Vec<String> = match &task_id {
        Some(id) => {
            let ids: Vec<String> = store
                .runs
                .iter()
                .filter(|r| &r.task_id == id && r.status != "running")
                .map(|r| r.id.clone())
                .collect();
            store
                .runs
                .retain(|r| &r.task_id != id || r.status == "running");
            ids
        }
        None => {
            let ids: Vec<String> = store
                .runs
                .iter()
                .filter(|r| r.status != "running")
                .map(|r| r.id.clone())
                .collect();
            store.runs.retain(|r| r.status == "running");
            ids
        }
    };
    write_store(&store, &state.data_dir);
    drop(store);
    for run_id in removed {
        let _ = std::fs::remove_file(state.logs_dir.join(format!("{run_id}.log")));
    }
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> Settings {
    state.store.lock().unwrap().settings.clone()
}

#[tauri::command]
pub fn update_settings(app: AppHandle, settings: Settings) -> Result<Settings, String> {
    let state = app.state::<AppState>();
    {
        let mut store = state.store.lock().unwrap();
        store.settings = settings.clone();
        write_store(&store, &state.data_dir);
    }
    apply_autostart(&app, settings.autostart);
    Ok(settings)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    let state = app.state::<AppState>();
    {
        let mut store = state.store.lock().unwrap();
        store.settings.autostart = enabled;
        write_store(&store, &state.data_dir);
    }
    apply_autostart(&app, enabled);
    Ok(enabled)
}

#[tauri::command]
pub fn check_rsync() -> RsyncInfo {
    match std::process::Command::new("rsync").arg("--version").output() {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout);
            let version = text.lines().next().unwrap_or("").trim().to_string();
            RsyncInfo {
                available: true,
                version,
            }
        }
        _ => RsyncInfo {
            available: false,
            version: String::new(),
        },
    }
}

#[tauri::command]
pub fn validate_cron(cron: String) -> bool {
    scheduler::is_valid_cron(&cron)
}

#[tauri::command]
pub fn next_runs(cron: String, count: Option<usize>) -> Vec<String> {
    scheduler::next_runs(&cron, count.unwrap_or(5))
}

#[tauri::command]
pub fn show_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Enable/disable OS-level autostart, ignoring "already in that state" errors.
pub fn apply_autostart(app: &AppHandle, enabled: bool) {
    let manager = app.autolaunch();
    let _ = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
}
