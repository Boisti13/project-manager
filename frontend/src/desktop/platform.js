// Built as the Windows app (desktop/, Tauri) with REACT_APP_TARGET=desktop;
// otherwise the normal web app served by the server.
export const IS_DESKTOP = process.env.REACT_APP_TARGET === 'desktop';

// Kept in step with desktop/src-tauri/tauri.conf.json (desktop.test.js checks it).
export const DESKTOP_VERSION = '0.5.2';

// The server API the app needs (GET /api/v1/sync/ came with 1.31.0).
export const MIN_SERVER_VERSION = '1.31.0';
