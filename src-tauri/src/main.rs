#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod paths;
mod portable;
mod vault;
mod workspace;

use std::sync::Mutex;
use tauri::{webview::NewWindowResponse, Manager, Url, WebviewWindowBuilder};
use workspace::WorkspaceStore;

fn workspace_origin(url: &Url) -> bool {
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    match (url.scheme(), url.host_str(), url.port()) {
        ("tauri", Some("localhost"), None) => true,
        ("http" | "https", Some("tauri.localhost"), None) => cfg!(windows),
        ("http", Some("127.0.0.1"), Some(1420)) => cfg!(dev),
        _ => false,
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(Mutex::new(WorkspaceStore::new(app.path().app_data_dir()?)));
            WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(workspace_origin)
                .on_new_window(|_, _| NewWindowResponse::Deny)
                .build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_workspace,
            commands::write_workspace,
            commands::enable_workspace_encryption,
            commands::export_portable_backup,
            commands::restore_portable_backup,
            commands::reveal_project_folder,
            commands::open_web_link,
        ])
        .run(tauri::generate_context!())
        .expect("NexaDesk could not start");
}
