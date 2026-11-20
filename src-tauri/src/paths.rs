pub fn valid_stored_path(path: &str) -> bool {
    if path.is_empty() {
        return true;
    }
    if path.encode_utf16().count() > 4096 || path.chars().any(char::is_control) {
        return false;
    }
    let bytes = path.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && matches!(bytes[2], b'/' | b'\\')
    {
        return path[3..]
            .split(['/', '\\'])
            .all(|part| part.is_empty() || windows_component(part));
    }
    path.starts_with('/')
        && !path.starts_with("//")
        && !path.contains('\\')
        && !path.split('/').any(|part| matches!(part, "." | ".."))
}

fn windows_component(name: &str) -> bool {
    let base = name
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end()
        .to_ascii_lowercase();
    let device = ["con", "prn", "aux", "nul"].contains(&base.as_str())
        || ["com", "lpt"].iter().any(|prefix| {
            base.strip_prefix(*prefix).is_some_and(|suffix| {
                ["1", "2", "3", "4", "5", "6", "7", "8", "9", "¹", "²", "³"].contains(&suffix)
            })
        });
    !device && !name.ends_with(['.', ' ']) && !name.contains([':', '*', '?', '"', '<', '>', '|'])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_device_paths_traversal_and_streams() {
        for path in [
            r"C:\CON",
            r"C:\COM¹.txt",
            r"C:\aux .txt",
            r"C:\folder.",
            r"C:\file:stream",
            r"\\host\share",
            "/var/../private",
            "relative/path",
        ] {
            assert!(!valid_stored_path(path));
        }
        assert!(valid_stored_path(r"C:\Development Notes"));
        assert!(valid_stored_path("/Users/Shared/Projects"));
    }
}
