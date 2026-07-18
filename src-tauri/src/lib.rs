mod commands;
mod models;
mod rsync;
mod runner;
mod scheduler;
mod state;
mod store;
mod tray;

use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let handle = app.handle();

            // Resolve the per-user data directory and ensure it exists.
            let data_dir = handle.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir).ok();
            let logs_dir = data_dir.join("logs");
            std::fs::create_dir_all(&logs_dir).ok();

            let store = store::load(&data_dir);
            let autostart = store.settings.autostart;
            let start_minimized = store.settings.start_minimized;

            app.manage(AppState {
                data_dir,
                logs_dir,
                store: Mutex::new(store),
                jobs: Mutex::new(HashMap::new()),
                running: Mutex::new(HashMap::new()),
            });

            // Runs left "running" by a previous crash are marked interrupted.
            store::reconcile_stale(handle);

            // Apply OS autostart preference and build the tray.
            commands::apply_autostart(handle, autostart);
            tray::create_tray(handle)?;

            // Register every enabled schedule.
            scheduler::reschedule_all(handle);

            if start_minimized {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let close_to_tray = window
                    .app_handle()
                    .state::<AppState>()
                    .store
                    .lock()
                    .unwrap()
                    .settings
                    .close_to_tray;
                if close_to_tray {
                    // Keep the scheduler alive in the tray instead of quitting.
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_tasks,
            commands::get_task,
            commands::save_task,
            commands::delete_task,
            commands::run_task,
            commands::cancel_run,
            commands::preview_command,
            commands::parse_command,
            commands::list_runs,
            commands::get_run_log,
            commands::clear_runs,
            commands::get_settings,
            commands::update_settings,
            commands::set_autostart,
            commands::check_rsync,
            commands::validate_cron,
            commands::next_runs,
            commands::show_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
