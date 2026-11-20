use crate::paths::valid_stored_path;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tempfile::NamedTempFile;

const MAX_BYTES: u64 = 64 * 1024 * 1024;
const MAX_REVISION: u64 = (1 << 53) - 1;
const CURRENT: &str = "workspace-v2.json";
const LEGACY: &str = "workspace.json";
const BACKUP: &str = "workspace-v1.backup.json";

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum StoreError {
    Blocked,
    Conflict,
    Corrupt,
    Invalid,
    TooLarge,
}

type Result<T> = std::result::Result<T, StoreError>;

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Workspace {
    projects: Vec<Project>,
    snippets: Vec<Snippet>,
    notes: Vec<Note>,
    theme: Theme,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Project {
    id: String,
    title: String,
    updated_at: String,
    description: String,
    tags: Vec<String>,
    status: ProjectStatus,
    path: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Snippet {
    id: String,
    title: String,
    updated_at: String,
    category: String,
    content: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Note {
    id: String,
    title: String,
    updated_at: String,
    topic: String,
    project_id: String,
    content: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Theme {
    Light,
    Dark,
    System,
}

#[derive(Deserialize, Serialize)]
enum ProjectStatus {
    #[serde(rename = "In Progress")]
    InProgress,
    Testing,
    Deployed,
    #[serde(rename = "On Hold")]
    OnHold,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Snapshot {
    version: u8,
    pub revision: u64,
    pub workspace: Workspace,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LegacyStore {
    #[serde(rename = "workspace.v1")]
    workspace: Option<Workspace>,
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
}

fn validate_entries<'a>(entries: impl Iterator<Item = (&'a str, &'a str, &'a str)>) -> Result<()> {
    let mut seen = HashSet::new();
    for (id, title, date) in entries {
        if !valid_id(id)
            || !seen.insert(id)
            || title.is_empty()
            || chrono::DateTime::parse_from_rfc3339(date).is_err()
        {
            return Err(StoreError::Corrupt);
        }
    }
    Ok(())
}

fn unchanged_or<T: ?Sized + PartialEq>(
    previous: Option<&T>,
    value: &T,
    is_valid: impl FnOnce(&T) -> bool,
) -> bool {
    previous == Some(value) || is_valid(value)
}

fn single_line(value: &str, limit: usize) -> bool {
    value.encode_utf16().count() <= limit && !value.chars().any(char::is_control)
}

fn multiline(value: &str, limit: usize) -> bool {
    value.encode_utf16().count() <= limit
        && !value
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\t' | '\n' | '\r'))
}

fn title(value: &str) -> bool {
    !value.trim().is_empty() && single_line(value, 120)
}

impl Workspace {
    fn validate(&self) -> Result<()> {
        validate_entries(self.projects.iter().map(|item| {
            (
                item.id.as_str(),
                item.title.as_str(),
                item.updated_at.as_str(),
            )
        }))?;
        validate_entries(self.snippets.iter().map(|item| {
            (
                item.id.as_str(),
                item.title.as_str(),
                item.updated_at.as_str(),
            )
        }))?;
        validate_entries(self.notes.iter().map(|item| {
            (
                item.id.as_str(),
                item.title.as_str(),
                item.updated_at.as_str(),
            )
        }))?;
        if self
            .notes
            .iter()
            .any(|note| !note.project_id.is_empty() && !valid_id(&note.project_id))
        {
            return Err(StoreError::Corrupt);
        }
        Ok(())
    }

    fn validate_edits(&self, previous: Option<&Self>) -> Result<()> {
        let projects: HashMap<_, _> = previous
            .into_iter()
            .flat_map(|data| &data.projects)
            .map(|item| (item.id.as_str(), item))
            .collect();
        let snippets: HashMap<_, _> = previous
            .into_iter()
            .flat_map(|data| &data.snippets)
            .map(|item| (item.id.as_str(), item))
            .collect();
        let notes: HashMap<_, _> = previous
            .into_iter()
            .flat_map(|data| &data.notes)
            .map(|item| (item.id.as_str(), item))
            .collect();
        for item in &self.projects {
            let old = projects.get(item.id.as_str());
            if !unchanged_or(old.map(|item| item.title.as_str()), &item.title, title)
                || !unchanged_or(
                    old.map(|item| item.description.as_str()),
                    &item.description,
                    |value| multiline(value, 16_000),
                )
                || !unchanged_or(
                    old.map(|item| item.path.as_str()),
                    &item.path,
                    valid_stored_path,
                )
                || !unchanged_or(old.map(|item| item.tags.as_slice()), &item.tags, |tags| {
                    tags.len() <= 24
                        && tags
                            .iter()
                            .all(|tag| !tag.is_empty() && single_line(tag, 48))
                })
            {
                return Err(StoreError::Invalid);
            }
        }
        for item in &self.snippets {
            let old = snippets.get(item.id.as_str());
            if !unchanged_or(old.map(|item| item.title.as_str()), &item.title, title)
                || !unchanged_or(
                    old.map(|item| item.category.as_str()),
                    &item.category,
                    |value| !value.is_empty() && single_line(value, 80),
                )
                || !unchanged_or(
                    old.map(|item| item.content.as_str()),
                    &item.content,
                    |value| !value.trim().is_empty() && multiline(value, 128_000),
                )
            {
                return Err(StoreError::Invalid);
            }
        }
        let project_ids: HashSet<_> = self.projects.iter().map(|item| item.id.as_str()).collect();
        for item in &self.notes {
            let old = notes.get(item.id.as_str());
            if !unchanged_or(old.map(|item| item.title.as_str()), &item.title, title)
                || !unchanged_or(old.map(|item| item.topic.as_str()), &item.topic, |value| {
                    single_line(value, 80)
                })
                || !unchanged_or(
                    old.map(|item| item.content.as_str()),
                    &item.content,
                    |value| !value.trim().is_empty() && multiline(value, 512_000),
                )
                || !unchanged_or(
                    old.map(|item| item.project_id.as_str()),
                    &item.project_id,
                    |value| value.is_empty() || project_ids.contains(value),
                )
            {
                return Err(StoreError::Invalid);
            }
        }
        Ok(())
    }

    pub fn project_path(&self, id: &str) -> Result<&str> {
        if !valid_id(id) {
            return Err(StoreError::Blocked);
        }
        self.projects
            .iter()
            .find(|project| project.id == id)
            .map(|project| project.path.as_str())
            .ok_or(StoreError::Blocked)
    }
}

pub struct WorkspaceStore(PathBuf);

impl WorkspaceStore {
    pub fn new(directory: PathBuf) -> Self {
        Self(directory)
    }

    pub fn read(&self) -> Result<Option<Snapshot>> {
        match fs::symlink_metadata(&self.0) {
            Ok(metadata) if !metadata.is_dir() || reparse(&metadata) => {
                return Err(StoreError::Blocked)
            }
            Ok(_) => {}
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(StoreError::Blocked),
        }
        let current = self.0.join(CURRENT);
        if let Some(bytes) = read_bytes(&current)? {
            let snapshot: Snapshot = from_json(&bytes)?;
            if snapshot.version != 2 || !(1..=MAX_REVISION).contains(&snapshot.revision) {
                return Err(StoreError::Corrupt);
            }
            snapshot.workspace.validate()?;
            return Ok(Some(snapshot));
        }
        let Some(bytes) = read_bytes(&self.0.join(LEGACY))? else {
            return Ok(None);
        };
        let legacy: LegacyStore = from_json(&bytes)?;
        let Some(workspace) = legacy.workspace else {
            return Ok(None);
        };
        workspace.validate()?;
        self.backup_legacy(&bytes)?;
        let snapshot = Snapshot {
            version: 2,
            revision: 1,
            workspace,
        };
        atomic_write(&current, &encode(&snapshot)?, false)?;
        Ok(Some(snapshot))
    }

    pub fn write(&self, workspace: Workspace, expected_revision: u64) -> Result<u64> {
        workspace.validate().map_err(|_| StoreError::Invalid)?;
        let current = self.read()?;
        let revision = current.as_ref().map_or(0, |stored| stored.revision);
        if revision != expected_revision || revision >= MAX_REVISION {
            return Err(StoreError::Conflict);
        }
        workspace.validate_edits(current.as_ref().map(|stored| &stored.workspace))?;
        let snapshot = Snapshot {
            version: 2,
            revision: revision + 1,
            workspace,
        };
        atomic_write(&self.0.join(CURRENT), &encode(&snapshot)?, revision > 0)?;
        Ok(snapshot.revision)
    }

    fn backup_legacy(&self, original: &[u8]) -> Result<()> {
        let path = self.0.join(BACKUP);
        match read_bytes(&path)? {
            None => atomic_write(&path, original, false),
            Some(existing) if existing == original => Ok(()),
            Some(_) => {
                let time = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|_| StoreError::Blocked)?;
                atomic_write(
                    &self
                        .0
                        .join(format!("workspace-v1.{}.backup.json", time.as_nanos())),
                    original,
                    false,
                )
            }
        }
    }
}

fn from_json<T: serde::de::DeserializeOwned>(bytes: &[u8]) -> Result<T> {
    serde_json::from_slice(bytes).map_err(|_| StoreError::Corrupt)
}

fn encode(snapshot: &Snapshot) -> Result<Vec<u8>> {
    let bytes = serde_json::to_vec(snapshot).map_err(|_| StoreError::Blocked)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(StoreError::TooLarge);
    }
    Ok(bytes)
}

fn read_bytes(path: &Path) -> Result<Option<Vec<u8>>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if !metadata.is_file() || reparse(&metadata) => {
            return Err(StoreError::Blocked)
        }
        Ok(_) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(StoreError::Blocked),
    }
    let file = File::open(path).map_err(|_| StoreError::Blocked)?;
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| StoreError::Blocked)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(StoreError::TooLarge);
    }
    Ok(Some(bytes))
}

fn reparse(metadata: &fs::Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    metadata.file_type().is_symlink()
}

fn atomic_write(path: &Path, bytes: &[u8], replace: bool) -> Result<()> {
    let parent = path.parent().ok_or(StoreError::Blocked)?;
    fs::create_dir_all(parent).map_err(|_| StoreError::Blocked)?;
    let metadata = fs::symlink_metadata(parent).map_err(|_| StoreError::Blocked)?;
    if !metadata.is_dir() || reparse(&metadata) {
        return Err(StoreError::Blocked);
    }
    let mut file = NamedTempFile::new_in(parent).map_err(|_| StoreError::Blocked)?;
    file.write_all(bytes).map_err(|_| StoreError::Blocked)?;
    file.as_file().sync_all().map_err(|_| StoreError::Blocked)?;
    if replace {
        file.persist(path).map_err(|_| StoreError::Blocked)?;
    } else {
        file.persist_noclobber(path)
            .map_err(|_| StoreError::Blocked)?;
    }
    // Once committed, a platform-specific directory flush failure cannot roll back the rename.
    #[cfg(unix)]
    if let Ok(directory) = File::open(parent) {
        let _ = directory.sync_all();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const EMPTY: &[u8] = br#"{"projects":[],"snippets":[],"notes":[],"theme":"light"}"#;

    #[test]
    fn migration_preserves_exact_source_and_keeps_a_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let legacy =
            br#" { "workspace.v1":{"projects":[],"snippets":[],"notes":[],"theme":"dark"} } "#;
        fs::write(dir.path().join(LEGACY), legacy).unwrap();
        let store = WorkspaceStore::new(dir.path().to_path_buf());
        assert_eq!(store.read().unwrap().unwrap().revision, 1);
        assert_eq!(fs::read(dir.path().join(BACKUP)).unwrap(), legacy);
        assert_eq!(fs::read(dir.path().join(LEGACY)).unwrap(), legacy);
        assert_eq!(store.write(from_json(EMPTY).unwrap(), 1), Ok(2));
        assert_eq!(fs::read(dir.path().join(BACKUP)).unwrap(), legacy);
    }

    #[test]
    fn refuses_corrupt_data_and_stale_writes() {
        let dir = tempfile::tempdir().unwrap();
        let store = WorkspaceStore::new(dir.path().to_path_buf());
        assert_eq!(store.write(from_json(EMPTY).unwrap(), 0), Ok(1));
        let file = dir.path().join(CURRENT);
        let saved = fs::read(&file).unwrap();
        assert_eq!(
            store.write(from_json(EMPTY).unwrap(), 0),
            Err(StoreError::Conflict)
        );
        assert_eq!(fs::read(&file).unwrap(), saved);
        fs::write(&file, b"corrupt").unwrap();
        assert_eq!(
            store.write(from_json(EMPTY).unwrap(), 1),
            Err(StoreError::Corrupt)
        );
        assert_eq!(fs::read(&file).unwrap(), b"corrupt");
    }

    #[test]
    fn refuses_migration_when_the_backup_cannot_be_written() {
        let dir = tempfile::tempdir().unwrap();
        let legacy = br#"{"workspace.v1":{"projects":[],"snippets":[],"notes":[],"theme":"dark"}}"#;
        fs::write(dir.path().join(LEGACY), legacy).unwrap();
        fs::create_dir(dir.path().join(BACKUP)).unwrap();
        let store = WorkspaceStore::new(dir.path().to_path_buf());
        assert!(matches!(store.read(), Err(StoreError::Blocked)));
        assert!(!dir.path().join(CURRENT).exists());
        assert_eq!(fs::read(dir.path().join(LEGACY)).unwrap(), legacy);
    }

    #[test]
    fn preserves_existing_folder_values_and_validates_changed_paths() {
        let dir = tempfile::tempdir().unwrap();
        let legacy = br#"{"workspace.v1":{"projects":[{"id":"legacy","title":"Old project","updatedAt":"2026-01-01T00:00:00.000Z","description":"","tags":[],"status":"Testing","path":"old-relative-folder"}],"snippets":[],"notes":[],"theme":"light"}}"#;
        fs::write(dir.path().join(LEGACY), legacy).unwrap();
        let store = WorkspaceStore::new(dir.path().to_path_buf());
        let mut workspace = store.read().unwrap().unwrap().workspace;
        workspace.projects[0].title = "Updated project".into();
        assert_eq!(store.write(workspace, 1), Ok(2));
        let mut workspace = store.read().unwrap().unwrap().workspace;
        assert_eq!(workspace.project_path("legacy"), Ok("old-relative-folder"));
        workspace.projects[0].path = "../another-relative-folder".into();
        assert_eq!(store.write(workspace, 2), Err(StoreError::Invalid));
        assert_eq!(store.read().unwrap().unwrap().revision, 2);
    }
}
