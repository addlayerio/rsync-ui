use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::runner;
use crate::state::AppState;

/// Build the persistent system-tray icon and its context menu.
pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show RSync UI", true, None::<&str>)?;
    let run_all = MenuItem::with_id(app, "run_all", "Run all scheduled now", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &run_all, &separator, &quit])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("a default window icon is bundled with the app");

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("RSync UI")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "run_all" => run_all_scheduled(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn run_all_scheduled(app: &AppHandle) {
    let ids: Vec<String> = app
        .state::<AppState>()
        .store
        .lock()
        .unwrap()
        .tasks
        .iter()
        .filter(|t| t.schedule.enabled)
        .map(|t| t.id.clone())
        .collect();
    for id in ids {
        let _ = runner::start_run(app, &id, "manual", None);
    }
}
