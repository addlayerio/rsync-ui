// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMABUF renderer leaves a blank window on many Linux setups
    // (Fedora, Nvidia, some Wayland compositors). Disable it transparently
    // unless the user already overrode the variable. Must be set before the
    // webview is created.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    rsync_ui_lib::run()
}
