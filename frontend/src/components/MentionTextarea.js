import React, { useEffect, useRef, useState } from 'react';
import { authFetch } from '../context/AuthContext';
import '../styles/Mentions.css';

// Users for suggestions, loaded once per page.
let usersPromise = null;
const loadUsers = () => {
  usersPromise =
    usersPromise ||
    authFetch('/api/users/')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  return usersPromise;
};

// "@an" right before the cursor (at the start or after a space).
const QUERY = /(?:^|\s)@([\w.-]*)$/;

/**
 * A textarea that suggests people when you type "@": ↑/↓ to choose,
 * Enter or Tab to insert "@username ", Esc to close the list. Other keys
 * (e.g. Ctrl+Enter to send) go to onKeyDown as usual.
 */
function MentionTextarea({ value, onChange, onKeyDown, ...props }) {
  const ref = useRef(null);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState(null); // null: no suggestions
  const [active, setActive] = useState(0);

  useEffect(() => {
    let alive = true;
    loadUsers().then((list) => alive && setUsers(list.filter((u) => u.is_active !== false)));
    return () => {
      alive = false;
    };
  }, []);

  const matches =
    query === null
      ? []
      : users.filter((u) => u.username.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6);

  const update = (el) => {
    const m = QUERY.exec(el.value.slice(0, el.selectionStart));
    setQuery(m ? m[1] : null);
    setActive(0);
  };

  const insert = (user) => {
    const el = ref.current;
    const before = el.value.slice(0, el.selectionStart).replace(/@([\w.-]*)$/, `@${user.username} `);
    const after = el.value.slice(el.selectionStart);
    onChange({ target: { value: before + after } });
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  };

  const keys = (e) => {
    if (matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
        return;
      }
      if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey) || e.key === 'Tab') {
        e.preventDefault();
        insert(matches[active]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault(); // closes the list, not the form
        e.stopPropagation();
        setQuery(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="mention-box">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => {
          onChange(e);
          update(e.target);
        }}
        onKeyDown={keys}
        onClick={(e) => update(e.target)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        aria-autocomplete="list"
        {...props}
      />
      {matches.length > 0 && (
        <ul className="mention-list" role="listbox">
          {matches.map((u, i) => (
            <li
              key={u.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                insert(u);
              }}
            >
              @{u.username}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default MentionTextarea;
