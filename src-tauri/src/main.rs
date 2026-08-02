use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Emitter, Manager, RunEvent, State};

const MAX_FILE_BYTES: u64 = 1_000_000;

#[derive(Default)]
struct PendingFiles(Mutex<Vec<String>>);

fn accepted(path: &Path) -> Result<(), String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if extension == "sil" || extension == "sui" {
        Ok(())
    } else {
        Err("Only .sil and .sui files can be opened by this application.".into())
    }
}

fn read_checked(path: &Path) -> Result<String, String> {
    accepted(path)?;
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("The selected path is not a regular file.".into());
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err("Files larger than 1 MB are not opened.".into());
    }
    fs::read_to_string(path).map_err(|error| format!("The file must be UTF-8 text: {error}"))
}

fn paths_from_urls(urls: impl IntoIterator<Item = url::Url>) -> Vec<PathBuf> {
    urls.into_iter()
        .filter_map(|url| url.to_file_path().ok())
        .filter(|path| accepted(path).is_ok())
        .collect()
}

fn queue_paths(app: &AppHandle, paths: impl IntoIterator<Item = PathBuf>) {
    let values: Vec<String> = paths
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    if values.is_empty() {
        return;
    }
    if let Some(state) = app.try_state::<PendingFiles>() {
        state
            .0
            .lock()
            .expect("pending file lock")
            .extend(values.clone());
    }
    let _ = app.emit("sil-file-opened", values);
}

#[tauri::command]
fn take_pending_files(state: State<'_, PendingFiles>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().expect("pending file lock"))
}

#[tauri::command]
fn read_sil_file(path: String) -> Result<String, String> {
    read_checked(Path::new(&path))
}

#[tauri::command]
fn save_sil_file(path: String, content: String) -> Result<(), String> {
    let target = Path::new(&path);
    accepted(target)?;
    if content.len() > MAX_FILE_BYTES as usize {
        return Err("Files larger than 1 MB cannot be saved.".into());
    }
    fs::write(target, content).map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(PendingFiles::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let base = PathBuf::from(cwd);
            let paths = argv
                .into_iter()
                .skip(1)
                .map(|arg| {
                    let path = PathBuf::from(arg);
                    if path.is_absolute() {
                        path
                    } else {
                        base.join(path)
                    }
                })
                .filter(|path| accepted(path).is_ok());
            queue_paths(app, paths);
        }))
        .setup(|app| {
            let paths = std::env::args_os()
                .skip(1)
                .map(PathBuf::from)
                .filter(|path| accepted(path).is_ok());
            queue_paths(app.handle(), paths);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_files,
            read_sil_file,
            save_sil_file
        ])
        .build(tauri::generate_context!())
        .expect("failed to build SIL/SUI File Editor")
        .run(|app, event| {
            if let RunEvent::Opened { urls } = event {
                queue_paths(app, paths_from_urls(urls));
            }
        });
}
