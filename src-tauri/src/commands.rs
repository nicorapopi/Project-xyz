use crate::{
    paths::valid_stored_path,
    workspace::{Snapshot, StoreError, Workspace, WorkspaceStore},
};
use std::{
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager, Url};

pub type StoreState = Mutex<WorkspaceStore>;

async fn with_store<T: Send + 'static>(
    app: AppHandle,
    operation: impl FnOnce(&WorkspaceStore) -> Result<T, StoreError> + Send + 'static,
) -> Result<T, StoreError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<StoreState>();
        let store = state.lock().map_err(|_| StoreError::Blocked)?;
        operation(&store)
    })
    .await
    .map_err(|_| StoreError::Blocked)?
}

#[tauri::command]
pub async fn read_workspace(app: AppHandle) -> Result<Option<Snapshot>, StoreError> {
    with_store(app, WorkspaceStore::read).await
}

#[tauri::command]
pub async fn write_workspace(
    app: AppHandle,
    workspace: Workspace,
    expected_revision: u64,
) -> Result<u64, StoreError> {
    with_store(app, move |store| store.write(workspace, expected_revision)).await
}

fn local_directory(input: &str) -> Result<PathBuf, StoreError> {
    if !valid_stored_path(input) {
        return Err(StoreError::Blocked);
    }
    let path = Path::new(input);
    if !path.is_absolute() {
        return Err(StoreError::Blocked);
    }
    #[cfg(windows)]
    {
        use std::{
            fs,
            os::windows::fs::MetadataExt,
            path::{Component, Prefix},
        };
        use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
        let mut components = path.components();
        let Some(Component::Prefix(prefix)) = components.next() else {
            return Err(StoreError::Blocked);
        };
        let Prefix::Disk(drive) = prefix.kind() else {
            return Err(StoreError::Blocked);
        };
        if !matches!(components.next(), Some(Component::RootDir)) {
            return Err(StoreError::Blocked);
        }
        let root = [u16::from(drive), u16::from(b':'), u16::from(b'\\'), 0];
        // The system receives a NUL-terminated drive root. Remote and unknown roots are excluded.
        if !matches!(unsafe { GetDriveTypeW(root.as_ptr()) }, 2 | 3 | 5 | 6) {
            return Err(StoreError::Blocked);
        }
        // Check before following any reparse points, including junctions to other volumes.
        let mut prefix = PathBuf::new();
        for component in path.components() {
            prefix.push(component.as_os_str());
            if matches!(component, Component::Normal(_)) {
                if fs::symlink_metadata(&prefix)
                    .map_err(|_| StoreError::Blocked)?
                    .file_attributes()
                    & 0x400
                    != 0
                {
                    return Err(StoreError::Blocked);
                }
            }
        }
    }
    let canonical = path.canonicalize().map_err(|_| StoreError::Blocked)?;
    if !canonical.is_dir() {
        return Err(StoreError::Blocked);
    }
    #[cfg(windows)]
    if !matches!(canonical.components().next(), Some(std::path::Component::Prefix(prefix)) if matches!(prefix.kind(), std::path::Prefix::VerbatimDisk(_) | std::path::Prefix::Disk(_)))
    {
        return Err(StoreError::Blocked);
    }
    Ok(canonical)
}

#[tauri::command]
pub async fn reveal_project_folder(app: AppHandle, project_id: String) -> Result<(), StoreError> {
    with_store(app, move |store| {
        let snapshot = store.read()?.ok_or(StoreError::Blocked)?;
        let directory = local_directory(snapshot.workspace.project_path(&project_id)?)?;
        tauri_plugin_opener::reveal_item_in_dir(directory).map_err(|_| StoreError::Blocked)
    })
    .await
}

fn safe_web_url(input: &str) -> Result<Url, StoreError> {
    let scheme = input.split_once("://").map(|(scheme, _)| scheme);
    if input.len() > 4096
        || input.chars().any(char::is_control)
        || !scheme.is_some_and(|scheme| {
            scheme.eq_ignore_ascii_case("http") || scheme.eq_ignore_ascii_case("https")
        })
    {
        return Err(StoreError::Blocked);
    }
    let url = Url::parse(input).map_err(|_| StoreError::Blocked)?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(StoreError::Blocked);
    }
    Ok(url)
}

#[tauri::command]
pub async fn open_web_link(url: String) -> Result<(), StoreError> {
    let url = safe_web_url(&url)?;
    tauri::async_runtime::spawn_blocking(move || {
        tauri_plugin_opener::open_url(url.as_str(), None::<&str>).map_err(|_| StoreError::Blocked)
    })
    .await
    .map_err(|_| StoreError::Blocked)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_validation_rejects_traversal_and_non_folders() {
        for input in [
            "../private",
            "/tmp/../private",
            r"\\server\share",
            r"\\?\C:\Users",
            "C:folder",
            "file:///tmp",
        ] {
            assert!(local_directory(input).is_err());
        }
        let dir = tempfile::tempdir().unwrap();
        assert!(local_directory(dir.path().to_str().unwrap()).is_ok());
        let file = dir.path().join("sample");
        std::fs::write(&file, b"sample").unwrap();
        assert!(local_directory(file.to_str().unwrap()).is_err());
    }

    #[test]
    fn only_opens_web_links_without_credentials() {
        for input in [
            "file:///etc/passwd",
            "http:example.com",
            "javascript:alert(1)",
            "https://user:pass@example.com",
            "https://exa\nmple.com",
        ] {
            assert!(safe_web_url(input).is_err());
        }
        assert!(safe_web_url("https://example.com/docs").is_ok());
    }
}
