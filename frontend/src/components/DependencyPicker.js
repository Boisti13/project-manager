import React, { useState } from 'react';
import { blockerSuggestions } from '../dependencies';
import '../styles/Dependencies.css';

// "Waits for": pick other tasks by typing part of their title.
function DependencyPicker({ tasks, task, value, onChange, projectIndex }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const chosen = value.map((id) => byId.get(id)).filter(Boolean);
  const suggestions = open ? blockerSuggestions(tasks, task, query, value) : [];

  const add = (t) => {
    onChange([...value, t.id]);
    setQuery('');
    setOpen(false); // don't cover the form's buttons; typing opens it again
  };

  const where = (t) => (t.project_id != null ? projectIndex?.labelOf(t.project_id) : '');

  return (
    <div className="dep-picker">
      {chosen.length > 0 && (
        <ul className="dep-chosen">
          {chosen.map((t) => (
            <li key={t.id} className={t.status === 'done' ? 'done' : ''}>
              <span className="dep-state">{t.status === 'done' ? '✓' : '⏳'}</span>
              <span className="dep-title">{t.title}</span>
              {where(t) && <span className="dep-where">{where(t)}</span>}
              <button
                type="button"
                className="link-btn"
                onClick={() => onChange(value.filter((id) => id !== t.id))}
                aria-label={`Remove ${t.title}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="dep-search">
        <input
          type="text"
          value={query}
          placeholder="Search a task this one waits for…"
          aria-label="Add a task this one waits for"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (suggestions[0]) add(suggestions[0]);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {suggestions.length > 0 && (
          <ul className="dep-suggestions" role="listbox">
            {suggestions.map((t) => (
              <li key={t.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(t)}>
                  <span className={t.status === 'done' ? 'dep-title done' : 'dep-title'}>{t.title}</span>
                  {where(t) && <span className="dep-where">{where(t)}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default DependencyPicker;
