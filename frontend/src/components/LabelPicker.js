import React, { useState } from 'react';
import { authFetch } from '../context/AuthContext';
import { labelTextColor } from '../labels';
import '../styles/Labels.css';
import { t } from '../i18n';

// Toggle labels on a task; new labels can be created right here.
// onCreated(label) lets the parent add it to its label list.
function LabelPicker({ labels, value, onChange, onCreated }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const selected = new Set(value);

  const toggle = (id) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = labels.find((l) => l.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      if (!selected.has(existing.id)) onChange([...value, existing.id]);
      setName('');
      setAdding(false);
      return;
    }
    setError(null);
    try {
      const res = await authFetch('/api/labels/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.detail) ? data.detail[0].msg : data.detail);
      onCreated?.(data);
      onChange([...value, data.id]);
      setName('');
      setAdding(false);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="label-picker">
      {labels.map((l) => {
        const on = selected.has(l.id);
        return (
          <button
            key={l.id}
            type="button"
            className={`label-chip label-option ${on ? 'on' : ''}`}
            style={on ? { backgroundColor: l.color, color: labelTextColor(l.color) } : { '--label-color': l.color }}
            aria-pressed={on}
            onClick={() => toggle(l.id)}
          >
            {on ? '✓ ' : ''}
            {l.name}
          </button>
        );
      })}
      {adding ? (
        <span className="label-new">
          <input
            type="text"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                create();
              } else if (e.key === 'Escape') {
                setAdding(false);
              }
            }}
            placeholder={t('New label')}
            aria-label={t('New label name')}
            autoFocus
          />
          <button type="button" className="btn btn-primary btn-small" onClick={create} disabled={!name.trim()}>
            {t('Add')}
          </button>
          <button type="button" className="link-btn" onClick={() => setAdding(false)}>
            {t('Cancel')}
          </button>
        </span>
      ) : (
        <button type="button" className="label-chip label-add" onClick={() => setAdding(true)}>
          {t('+ New label')}
        </button>
      )}
      {error && <small className="label-error">{error}</small>}
    </div>
  );
}

export default LabelPicker;
