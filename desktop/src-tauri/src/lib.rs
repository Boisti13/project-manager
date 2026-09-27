// The app is the React frontend (frontend/, built with
// REACT_APP_TARGET=desktop) in a native window; everything else -- the
// local copy of the data and syncing with the server -- happens in there
// (frontend/src/desktop). No Rust commands needed so far.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Project Manager");
}
