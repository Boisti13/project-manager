import React from 'react';
import { renderMarkdown } from '../markdown';
import { highlightParts } from '../taskFilters';
import { IS_DESKTOP } from '../desktop/platform';
import '../styles/Markdown.css';

// Windows app: links open in the browser (Tauri's opener plugin), not inside the app.
// Use as a link's onClick; null in the web app.
export const openInBrowser = IS_DESKTOP
  ? (e, url) => {
      const invoke = window.__TAURI__?.core?.invoke;
      if (!invoke) return;
      e.preventDefault();
      invoke('plugin:opener|open_url', { url }).catch(() => {});
    }
  : null;

/**
 * Formatted text (markdown.js): task descriptions, comments, the shared
 * project page. `highlight` marks search matches in the text.
 */
function Markdown({ text, highlight = '', className = '' }) {
  const renderText = highlight
    ? (s, key) => (
        <React.Fragment key={key}>
          {highlightParts(s, highlight).map((part, i) =>
            part.hit ? <mark key={i}>{part.text}</mark> : <React.Fragment key={i}>{part.text}</React.Fragment>
          )}
        </React.Fragment>
      )
    : (s) => s;
  return <div className={`md ${className}`}>{renderMarkdown(text, { renderText, onLink: openInBrowser })}</div>;
}

export default Markdown;
