import React from 'react';
import { t } from '../../i18n';

// Keyboard shortcuts on the Tasks page (useTaskShortcuts.js), as shown with "?".
const SHORTCUTS = () => [
  ['n', t('New task')],
  ['/', t('Search')],
  ['j / k', t('Next / previous task')],
  ['e', t('Edit')],
  ['x', t('Mark done / not done')],
  ['a', t('Add subtask')],
  ['p', t('Pin / unpin on My day')],
  ['c', t('Comments & history')],
  ['o', t('Open / close subtasks')],
  ['Space', t('Select it, to change several at once')],
  ['Del', t('Delete (the selected ones, when selecting)')],
  ['Esc', t('Clear the selection')],
  ['Ctrl+Enter', t('Save the form')],
  ['?', t('Show / hide this list')],
];

/** The "Keyboard shortcuts ?" link under the list, and the list itself. */
function KeyboardHelp({ open, setOpen }) {
  return (
    <>
      <p className="kbd-hint">
        <button className="link-btn" onClick={() => setOpen(true)}>
          {t('Keyboard shortcuts')}
        </button>{' '}
        <kbd>?</kbd>
      </p>

      {open && (
        <div className="kbd-help-backdrop" onClick={() => setOpen(false)}>
          <div
            className="kbd-help"
            role="dialog"
            aria-modal="true"
            aria-label={t('Keyboard shortcuts')}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>{t('Keyboard shortcuts')}</h2>
            <dl>
              {SHORTCUTS().map(([key, what]) => (
                <React.Fragment key={key}>
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{what}</dd>
                </React.Fragment>
              ))}
            </dl>
            <p className="kbd-help-note">{t('j / k pick a task in the list; the other keys act on it.')}</p>
            <button className="btn btn-secondary btn-small" onClick={() => setOpen(false)} autoFocus>
              {t('Close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default KeyboardHelp;
