// The app is the React frontend (frontend/, built with
// REACT_APP_TARGET=desktop) in a native window; everything else -- the
// local copy of the data and syncing with the server -- happens in there
// (frontend/src/desktop). The native parts are plugins: the updater
// (frontend/src/desktop/updater.js), the opener, which opens links in the
// browser (frontend/src/components/Markdown.js), and the HTTP client, which
// the Linux app uses to reach the server (WebKitGTK would block plain-HTTP
// requests from the app's page; frontend/src/desktop/server.js).

/// How the app was installed, for updates: "installer" (Windows) and
/// "appimage" update themselves; "package" (a .deb) is updated by
/// installing the new package.
#[tauri::command]
fn install_kind() -> &'static str {
    if cfg!(target_os = "linux") {
        if std::env::var_os("APPIMAGE").is_some() {
            "appimage"
        } else {
            "package"
        }
    } else {
        "installer"
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![install_kind])
        .run(tauri::generate_context!())
        .expect("error while running Project Manager");
}
