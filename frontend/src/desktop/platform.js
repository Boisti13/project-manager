// Built as the Windows app (desktop/, Tauri) with REACT_APP_TARGET=desktop;
// otherwise the normal web app served by the server.
export const IS_DESKTOP = process.env.REACT_APP_TARGET === 'desktop';

// Which desktop the app runs on (for texts like "Linux app").
export const DESKTOP_OS = typeof navigator !== 'undefined' && /Linux/.test(navigator.userAgent) ? 'Linux' : 'Windows';

// Kept in step with desktop/src-tauri/tauri.conf.json (desktop.test.js checks it).
export const DESKTOP_VERSION = '0.14.3';

// The server API the app needs (GET /api/v1/sync/ came with 1.31.0).
export const MIN_SERVER_VERSION = '1.31.0';
