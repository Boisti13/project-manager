// The app is the React frontend (frontend/, built with
// REACT_APP_TARGET=desktop) in a native window; everything else -- the
// local copy of the data and syncing with the server -- happens in there
// (frontend/src/desktop). The native parts are the updater plugin
// (frontend/src/desktop/updater.js) and the opener plugin, which opens links
// in the browser (frontend/src/components/Markdown.js).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running Project Manager");
}
