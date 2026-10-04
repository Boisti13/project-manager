import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authFetch, useAuth } from '../context/AuthContext';
import { parseQuickEntry } from '../quickEntry';
import QuickChips, { quickChipText } from './QuickChips';
import { t } from '../i18n';
import '../styles/MyDay.css';

// My day: add a task without leaving the page. The title takes quick entry
// ("Call supplier tomorrow !high #hardware @anna"); tasks are yours unless
// @someone else. The project choice is remembered per device. "n" focuses it.
const PROJECT_KEY = 'pm.quickAddProject';

const typing = (el) => el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

const readProject = () => {
  try {
    const v = localStorage.getItem(PROJECT_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
};

/** The new task's fields from the typed text and its quick-entry result. */
export function quickAddBody(text, quick, { projectId, me }) {
  const body = {
    title: quick.title || text.trim(),
    project_id: projectId,
    assignee_id: quick.assigneeId ?? me,
    priority: quick.priority ?? 0,
    label_ids: quick.labelIds,
    deadline: quick.deadline,
    start_date: quick.startDate,
  };
  if (quick.repeat) {
    body.recurrence_unit = quick.repeat.unit;
    body.recurrence_interval = quick.repeat.interval;
    body.recurrence_weekdays = quick.repeat.weekdays;
  }
  return body;
}

/** projectIndex: the (workspace-scoped) project index; labels for #name; onAdded() reloads the page. */
function QuickAdd({ projectIndex, labels, onAdded }) {
  const { currentUser } = useAuth();
  const [text, setText] = useState('');
  const [ignored, setIgnored] = useState(() => new Set());
  const [projectId, setProjectId] = useState(readProject);
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(null); // { id, title, chips }
  const [error, setError] = useState(null);
  const input = useRef(null);

  useEffect(() => {
    authFetch('/api/users/')
      .then((r) => (r.ok ? r.json() : []))
      .then(setUsers)
      .catch(() => setUsers([]));
  }, []);

  // "n" anywhere on the page (not while typing) jumps here.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Projects (and categories) of the current workspace; a remembered one
  // that's no longer there counts as none.
  const choices = useMemo(
    () => projectIndex.topLevel.flatMap((p) => [p, ...projectIndex.categoriesOf(p.id)]),
    [projectIndex]
  );
  const project = choices.some((p) => p.id === projectId) ? projectId : null;
  const assignable = useMemo(() => projectIndex.assignableUsers(project, users), [projectIndex, project, users]);
  const quick = useMemo(
    () => (text.trim() ? parseQuickEntry(text, { labels, users: assignable, me: currentUser?.id, ignore: ignored }) : null),
    [text, labels, assignable, currentUser, ignored]
  );

  const chooseProject = (value) => {
    const id = value === '' ? null : Number(value);
    setProjectId(id);
    try {
      if (id == null) localStorage.removeItem(PROJECT_KEY);
      else localStorage.setItem(PROJECT_KEY, String(id));
    } catch {
      // per-browser convenience only
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!quick || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authFetch('/api/tasks/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quickAddBody(text, quick, { projectId: project, me: currentUser?.id })),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? t(data.detail) : `HTTP ${res.status}`);
      setAdded({ id: data.id, title: data.title, chips: quick.tokens.map(quickChipText) });
      setText('');
      setIgnored(new Set());
      onAdded();
    } catch (err) {
      setError(t('Couldn’t add the task: {error}', { error: err.message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="quick-add" onSubmit={submit}>
      <div className="quick-add-row">
        <input
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAdded(null);
          }}
          placeholder={t('Add a task — e.g. Call supplier tomorrow !high #hardware')}
          aria-label={t('Add a task')}
          maxLength={500}
        />
        <select value={project ?? ''} onChange={(e) => chooseProject(e.target.value)} aria-label={t('Project')}>
          <option value="">{t('No project')}</option>
          {choices.map((p) => (
            <option key={p.id} value={p.id}>
              {projectIndex.labelOf(p.id)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={!quick || busy}>
          {t('Add')}
        </button>
      </div>
      {quick ? (
        <QuickChips quick={quick} onIgnore={(key) => setIgnored((prev) => new Set([...prev, key]))} hint={false} />
      ) : (
        <small className="form-hint">
          {t('Assigned to you unless you write @name. Quick: tomorrow, fri, 5.10., every monday · !high · #label')} · <kbd>n</kbd>
        </small>
      )}
      {added && (
        <p className="quick-add-done" role="status">
          {t('✓ Added “{title}”', { title: added.title })}
          {added.chips.length > 0 && ` · ${added.chips.join(' · ')}`} · <Link to={`/?task=${added.id}`}>{t('open')}</Link>
        </p>
      )}
      {error && <p className="error-message">{error}</p>}
    </form>
  );
}

export default QuickAdd;
