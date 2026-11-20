fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "read_workspace",
            "write_workspace",
            "enable_workspace_encryption",
            "reveal_project_folder",
            "open_web_link",
        ]),
    ))
    .expect("Could not generate NexaDesk capabilities");
}
