import React, { useEffect, useRef } from 'react';
import '../styles/UndoToast.css';
import { t } from '../i18n';

export const UNDO_MS = 7000;

/**
 * "Deleted “Order cables” · Undo" at the bottom of the screen; goes away by
 * itself after UNDO_MS. undo = { key, message, onUndo } or null.
 */
function UndoToast({ undo, onClose }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!undo) return undefined;
    const timer = setTimeout(() => closeRef.current(), UNDO_MS);
    return () => clearTimeout(timer);
  }, [undo]);

  if (!undo) return null;
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="undo-message">{undo.message}</span>
      {undo.onUndo && (
        <button
          className="undo-btn"
          onClick={() => {
            undo.onUndo();
            onClose();
          }}
        >
          {t('Undo')}
        </button>
      )}
      <button className="undo-close" onClick={onClose} aria-label={t('Close')}>
        ✕
      </button>
    </div>
  );
}

export default UndoToast;
