import React from 'react';
import { t } from '../i18n';

// Download links for the Windows and Linux app. They point at the latest
// GitHub release, which always carries the newest app under these names
// (scripts/attach-apps.sh), so they never need updating.
const BASE = 'https://github.com/Boisti13/project-manager/releases/latest/download/';

export const APP_FILES = [
  { os: 'windows', label: 'Windows 10/11', file: 'ProjectManager-Windows-x64-setup.exe' },
  { os: 'linux', label: 'Linux x86_64 (AppImage)', file: 'ProjectManager-Linux-x86_64.AppImage' },
  { os: 'linux', label: 'Linux ARM64 (AppImage)', file: 'ProjectManager-Linux-arm64.AppImage' },
  { os: 'linux', label: 'Debian/Ubuntu x86_64 (.deb)', file: 'ProjectManager-Linux-x86_64.deb' },
  { os: 'linux', label: 'Debian/Raspberry Pi OS ARM64 (.deb)', file: 'ProjectManager-Linux-arm64.deb' },
];

function currentOs() {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad/.test(ua)) return null;
  if (/Windows/.test(ua)) return 'windows';
  if (/Linux|X11/.test(ua)) return 'linux';
  return null;
}

function AppDownloads() {
  const os = currentOs();
  return (
    <div className="settings-section">
      <h2>{t('Windows and Linux app')}</h2>
      <p className="settings-help">
        {t('Works offline and syncs with this server when it can reach it. The Windows app and the AppImages update themselves.')}
      </p>
      <ul className="app-downloads">
        {APP_FILES.map((a) => (
          <li key={a.file} className={a.os === os ? 'app-download-mine' : ''}>
            <a href={BASE + a.file}>{a.label}</a>
            {a.os === os && a.file === APP_FILES.find((x) => x.os === os).file && (
              <span className="app-download-tag">{t('for this computer')}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="settings-help">
        <a href="https://github.com/Boisti13/project-manager/blob/main/desktop/README.md#installing" target="_blank" rel="noopener noreferrer">
          {t('How to install')}
        </a>
      </p>
    </div>
  );
}

export default AppDownloads;
