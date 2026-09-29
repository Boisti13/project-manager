import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import TaskItem from './TaskItem';
import TaskForm from './TaskForm';
import TaskBoard from './TaskBoard';
import TaskCalendar from './TaskCalendar';
import UndoToast from './UndoToast';
import BulkEditBar from './BulkEditBar';
import FilterBar from './tasklist/FilterBar';
import TaskGroups from './tasklist/TaskGroups';
import KeyboardHelp from './tasklist/KeyboardHelp';
import { sendJson } from './tasklist/taskApi';
import { useTaskData, useOptionalList } from './tasklist/useTaskData';
import { useUndoableDelete } from './tasklist/useUndoableDelete';
import { useSelection } from './tasklist/useSelection';
import { useSavedFilters } from './tasklist/useSavedFilters';
import { useTaskShortcuts } from './tasklist/useTaskShortcuts';
import { usePins } from './usePins';
import { flattenVisible } from '../views';
import { buildLabelIndex } from '../labels';
import { buildDependencyIndex } from '../dependencies';
import { authFetch, useAuth } from '../context/AuthContext';
import { DEFAULT_FILTERS, buildTaskTree, filtersFromParams, filtersToParams, hasActiveFilters } from '../taskFilters';
import { buildProjectIndex, groupTasksByProject } from '../projects';
import { childIndex, remainingMinutes } from '../estimate';
import { bulkChanges, siblingsOf, reorderUpdates } from '../taskOps';
import '../styles/TaskList.css';
import '../styles/TaskViews.css';
import { t, tn } from '../i18n';
import TaskTimeline from './TaskTimeline';
import { isListView } from '../views';
import { dateRangeText } from './TaskItem';

const VIEWS = [
  { id: 'list', label: () => t('☰ List') },
  { id: 'board', label: () => t('▦ Board') },
  { id: 'calendar', label: () => t('📅 Calendar') },
  { id: 'timeline', label: () => t('▤ Timeline') },
];

const COLLAPSED_KEY = 'pm.collapsedGroups';

function loadCollapsedGroups() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

// Adds or removes `id` in a Set held in state.
const toggleIn = (setter, id) =>
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

// The Tasks page: list, board and calendar views of the filtered task tree,
// with the task form, select mode, Undo and keyboard shortcuts. The parts
// live in ./tasklist/ and ../taskOps.js.
function TaskList() {
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const filtering = hasActiveFilters(filters);
  const listView = isListView(filters.view);

  // A delete waiting out its Undo time (useUndoableDelete); its tasks stay hidden on reload.
  const pendingDelete = useRef(null);
  const { tasks, setTasks, projects, users, labels, setLabels, archiveAfterDays, loading, error, setError, loadData } =
    useTaskData(pendingDelete);
  const [templates, reloadTemplates] = useOptionalList('/api/v1/templates/');
  // The bar at the bottom: { key, message, onUndo? }.
  const [undo, setUndo] = useState(null);
  const deleteTasks = useUndoableDelete({ pendingDelete, setTasks, reload: loadData, setError, setUndo });
  const selection = useSelection({ view: filters.view, tasks, filters });

  // The task form: new (optionally in a project / below a parent) or edit.
  const [showForm, setShowForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [parentTaskForNew, setParentTaskForNew] = useState(null);
  const [projectForNew, setProjectForNew] = useState(null);

  // What's open: project/category sections (remembered), subtasks, Completed rows.
  const [collapsedGroups, setCollapsedGroups] = useState(loadCollapsedGroups);
  const [expandedIds, setExpandedIds] = useState(new Set());
  // Rows the user collapsed even though a filter match auto-expanded them.
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  // Expanded "Completed (n)" rows; collapsed by default, not persisted.
  const [openCompleted, setOpenCompleted] = useState(new Set());
  // Set from a notification link (?task=ID&comments=1).
  const [focusCommentsId, setFocusCommentsId] = useState(null);
  // Tasks whose comments match the search text (searched server-side).
  const [commentMatchIds, setCommentMatchIds] = useState(null);
  // Keyboard: the row picked with j/k, and the shortcut list.
  const [keyboardId, setKeyboardId] = useState(null);
  const [showKeys, setShowKeys] = useState(false);
  const searchRef = useRef(null);

  const setFilter = (key, value) => {
    setSearchParams(filtersToParams({ ...filters, [key]: value }), { replace: true });
    setCollapsedIds(new Set());
  };

  const clearFilters = () => {
    setSearchParams(filtersToParams({ ...DEFAULT_FILTERS, sort: filters.sort, view: filters.view }), { replace: true });
    setCollapsedIds(new Set());
  };

  const pins = usePins((error) => setError(t('Failed to pin: {error}', { error })));
  const togglePin = (task) => pins.toggle(task.id);

  const saved = useSavedFilters({ filters, setSearchParams, setError, onApplied: () => setCollapsedIds(new Set()) });

  useEffect(() => {
    const q = filters.q.trim();
    if (!q) {
      setCommentMatchIds(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await authFetch(`/api/comments/search?q=${encodeURIComponent(q)}`);
        if (res.ok && !cancelled) setCommentMatchIds(new Set(await res.json()));
      } catch {
        // search still works on titles/descriptions
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters.q]);

  // ---- the form

  const closeForm = () => {
    setShowForm(false);
    setSelectedTask(null);
    setParentTaskForNew(null);
    setProjectForNew(null);
  };

  const handleCreateTask = async (formData) => {
    try {
      await sendJson('/api/tasks/', 'POST', formData);
      if (formData.parent_task_id) {
        setExpandedIds((prev) => new Set(prev).add(formData.parent_task_id));
      }
      setShowForm(false);
      setParentTaskForNew(null);
      await loadData();
    } catch (err) {
      setError(t('Failed to create task: {error}', { error: err.message }));
    }
  };

  // "Several (one per line)": one request, all tasks or none.
  const handleBulkCreate = async (payload) => {
    try {
      const res = await sendJson('/api/tasks/bulk', 'POST', payload);
      // Show the new tree: expand the parent and every new task with subtasks.
      const created = new Set(res.ids);
      const hasKids = new Set();
      const walk = (items, ids) => {
        items.forEach((item) => {
          const id = ids.shift();
          if (item.children.length) hasKids.add(id);
          walk(item.children, ids);
        });
      };
      walk(payload.items, [...res.ids]);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (payload.parent_task_id) next.add(payload.parent_task_id);
        hasKids.forEach((id) => created.has(id) && next.add(id));
        return next;
      });
      closeForm();
      await loadData();
    } catch (err) {
      setError(t('Failed to create tasks: {error}', { error: err.message }));
    }
  };

  const handleUpdateTask = async (formData) => {
    try {
      await sendJson(`/api/tasks/${selectedTask.id}`, 'PUT', formData);
      setSelectedTask(null);
      setShowForm(false);
      await loadData();
    } catch (err) {
      setError(t('Failed to update task: {error}', { error: err.message }));
    }
  };

  const handleTemplateCreate = async (templateId, payload) => {
    try {
      const res = await sendJson(`/api/v1/templates/${templateId}/use`, 'POST', payload);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (payload.parent_task_id) next.add(payload.parent_task_id);
        if (res.ids.length > 1) next.add(res.ids[0]);
        return next;
      });
      closeForm();
      await loadData();
    } catch (err) {
      setError(t('Failed to create tasks: {error}', { error: err.message }));
    }
  };

  const handleSaveTemplate = async (task) => {
    const name = window.prompt(t('Save “{title}” with its subtasks as a template named:', { title: task.title }), task.title);
    if (!name || !name.trim()) return;
    try {
      await sendJson('/api/v1/templates/', 'POST', { name: name.trim(), task_id: task.id });
      await reloadTemplates();
      setUndo({ key: Date.now(), message: t('Saved as template “{name}”', { name: name.trim() }) });
    } catch (err) {
      setError(t('Failed to save the template: {error}', { error: err.message }));
    }
  };

  const handleEditTask = (task) => {
    setSelectedTask(task);
    setParentTaskForNew(null);
    setShowForm(true);
  };

  const handleAddSubtask = (task) => {
    setSelectedTask(null);
    setParentTaskForNew(task);
    setShowForm(true);
  };

  const openNewTask = (projectId = null) => {
    setSelectedTask(null);
    setParentTaskForNew(null);
    setProjectForNew(projectId);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---- changes from the rows, board and calendar

  // "Undo" after ticking a task off: back to the status it had.
  const offerUndoDone = (task) =>
    setUndo({
      key: Date.now(),
      message: t('Marked “{title}” done', { title: task.title }),
      onUndo: async () => {
        try {
          await sendJson(`/api/tasks/${task.id}`, 'PUT', { status: task.status });
        } catch (err) {
          setError(t('Failed to update task: {error}', { error: err.message }));
        }
        await loadData(true);
      },
    });

  // Changes the row right away and rolls back if the request fails.
  const changeOptimistically = async (task, fields, failureText) => {
    const previous = tasks;
    setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, ...fields } : x)));
    try {
      await sendJson(`/api/tasks/${task.id}`, 'PUT', fields);
      return true;
    } catch (err) {
      setTasks(previous);
      setError(failureText(err.message));
      return false;
    }
  };

  const updateFailed = (error) => t('Failed to update task: {error}', { error });

  // Checkbox: done <-> todo.
  const handleToggleDone = async (task) => {
    const status = task.status === 'done' ? 'todo' : 'done';
    if (!(await changeOptimistically(task, { status }, updateFailed))) return;
    if (status === 'done') offerUndoDone(task);
    // A repeating task just created its next occurrence on the server.
    if (status === 'done' && task.recurrence_unit) await loadData();
  };

  // Board: move a card to another column.
  const handleSetStatus = async (task, status) => {
    if (!(await changeOptimistically(task, { status }, updateFailed))) return;
    if (status === 'done' && task.status !== 'done') offerUndoDone(task);
    // Reload for completed_at (Done column order) and repeating tasks.
    if (status === 'done' || task.status === 'done') await loadData();
  };

  // Timeline: a bar dragged to new dates; Undo puts the old ones back.
  const handleChangeDates = async (task, fields) => {
    const before = Object.fromEntries(Object.keys(fields).map((k) => [k, task[k] ?? null]));
    if (!(await changeOptimistically(task, fields, updateFailed))) return;
    const span = { ...task, ...fields };
    setUndo({
      key: Date.now(),
      message: t('Moved “{title}”: {dates}', { title: task.title, dates: dateRangeText(span) }),
      onUndo: async () => {
        try {
          await sendJson(`/api/tasks/${task.id}`, 'PUT', before);
        } catch (err) {
          setError(updateFailed(err.message));
        }
        await loadData(true);
      },
    });
  };

  // Calendar: drop a task on another day.
  const handleReschedule = (task, day) =>
    changeOptimistically(task, { deadline: `${day}T00:00:00` }, (error) =>
      t('Failed to move the deadline: {error}', { error })
    );

  const handleDeleteTask = (taskId) => deleteTasks(tasks, [taskId]);

  const handleReorder = async (draggedId, targetId) => {
    const updates = reorderUpdates(tasks, draggedId, targetId);
    if (updates.length === 0) return;
    try {
      await Promise.all(updates.map((u) => sendJson(`/api/tasks/${u.id}`, 'PUT', { order: u.order })));
      await loadData();
    } catch (err) {
      setError(t('Failed to reorder tasks: {error}', { error: err.message }));
    }
  };

  const getMoveState = (task) => {
    const reorderable = filters.sort === 'manual';
    if (!reorderable) return { up: false, down: false, reorderable };
    const sibs = siblingsOf(tasks, task);
    const i = sibs.findIndex((x) => x.id === task.id);
    return { up: i > 0, down: i >= 0 && i < sibs.length - 1, reorderable };
  };

  const handleMove = (task, dir) => {
    const sibs = siblingsOf(tasks, task);
    const target = sibs[sibs.findIndex((x) => x.id === task.id) + dir];
    if (target) handleReorder(task.id, target.id);
  };

  const handleMoveTo = async (task, projectId) => {
    if ((task.project_id ?? null) === projectId) return;
    try {
      await sendJson(`/api/tasks/${task.id}`, 'PUT', { project_id: projectId });
      await loadData();
      navigate(`/?task=${task.id}`, { replace: true });
    } catch (err) {
      setError(t('Failed to move task: {error}', { error: err.message }));
    }
  };

  const handleCommentCount = (taskId, n) =>
    setTasks((ts) => ts.map((x) => (x.id === taskId && x.comment_count !== n ? { ...x, comment_count: n } : x)));

  // ---- select mode: one change for all selected tasks, with Undo per task

  const applyBulk = async (change) => {
    const { updates, before } = bulkChanges(tasks, selection.ids, change);
    if (updates.length === 0) {
      setUndo({ key: Date.now(), message: t('Nothing to change — they’re all like that already.') });
      return;
    }
    const send = (list) => sendJson('/api/v1/tasks/bulk-update', 'POST', { updates: list });
    try {
      await send(updates);
      await loadData(true);
      setUndo({
        key: Date.now(),
        message: tn(updates.length, 'Changed one task', 'Changed {n} tasks'),
        onUndo: async () => {
          try {
            await send(before);
          } catch (err) {
            setError(t('Failed to change the tasks: {error}', { error: err.message }));
          }
          await loadData(true);
          // Back in view (e.g. un-done): selected again.
          selection.setIds((prev) => new Set([...prev, ...updates.map((u) => u.id)]));
        },
      });
    } catch (err) {
      setError(t('Failed to change the tasks: {error}', { error: err.message }));
    }
  };

  const deleteSelected = () => {
    const picked = [...selection.ids];
    deleteTasks(tasks, picked, () => selection.setIds(new Set(picked)));
    selection.clear();
  };

  // ---- views

  const setView = (view) => setSearchParams(filtersToParams({ ...filters, view }), { replace: true });

  // Board/Calendar: show a task in the list (same filters).
  const openInList = (task) =>
    setSearchParams({ ...filtersToParams({ ...filters, view: 'list' }), task: String(task.id) }, { replace: true });

  const toggleGroup = (key) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
      } catch {
        // per-browser convenience only
      }
      return next;
    });

  const projectIndex = useMemo(() => buildProjectIndex(projects), [projects]);
  // Estimates add up over all subtasks, also the ones a filter hides.
  const allChildrenOf = useMemo(() => childIndex(tasks), [tasks]);
  const remainingOf = useCallback((task) => remainingMinutes(task, allChildrenOf), [allChildrenOf]);
  const labelIndex = useMemo(() => buildLabelIndex(labels), [labels]);
  const dependencyIndex = useMemo(() => buildDependencyIndex(tasks), [tasks]);
  const filterByLabel = (label) => setFilter('label', String(label.id));

  const myOpenCount = useMemo(
    () => tasks.filter((x) => x.assignee_id === currentUser?.id && x.status !== 'done').length,
    [tasks, currentUser]
  );

  // Jump to a task from a notification: open everything on the way to it,
  // scroll it into view and flash it; optionally open its comments.
  const focusTaskId = searchParams.get('task');
  useEffect(() => {
    if (!focusTaskId || loading || tasks.length === 0) return;
    const byId = new Map(tasks.map((x) => [x.id, x]));
    const target = byId.get(parseInt(focusTaskId, 10));
    const withComments = searchParams.get('comments') === '1';
    const next = new URLSearchParams(searchParams);
    next.delete('task');
    next.delete('comments');
    setSearchParams(next, { replace: true });
    if (!target) {
      setError(t('That task no longer exists.'));
      return;
    }

    let root = target;
    const ancestors = [];
    while (root.parent_task_id != null && byId.has(root.parent_task_id)) {
      root = byId.get(root.parent_task_id);
      ancestors.push(root.id);
    }
    setExpandedIds((prev) => new Set([...prev, ...ancestors]));
    setCollapsedIds(new Set());

    const top = root.project_id != null ? projectIndex.topOf(root.project_id) : null;
    const groupKey = top ? `p${top.id}` : 'none';
    const bucketKey = top && top.id !== root.project_id ? `c${root.project_id}` : groupKey;
    setCollapsedGroups((prev) => {
      const keep = new Set([...prev].filter((k) => k !== groupKey && k !== bucketKey));
      return keep.size === prev.size ? prev : keep;
    });
    if (root.status === 'done') setOpenCompleted((prev) => new Set(prev).add(`${bucketKey}-done`));
    if (withComments) setFocusCommentsId(target.id);

    // Not cleared on re-run: removing ?task= above re-runs this effect, and
    // that must not cancel the scroll.
    setTimeout(() => {
      const el = document.getElementById(`task-${target.id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('task-flash');
      setTimeout(() => el.classList.remove('task-flash'), 2200);
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTaskId, loading, tasks.length]);

  const tree = useMemo(
    () =>
      buildTaskTree(tasks, filters, {
        currentUserId: currentUser?.id,
        projectParentOf: projectIndex.parentIdOf,
        archiveAfterDays,
        commentMatchIds,
        labelNameOf: labelIndex.nameOf,
        isArchivedProject: projectIndex.isArchived,
      }),
    [tasks, filters, currentUser, projectIndex, archiveAfterDays, commentMatchIds, labelIndex]
  );

  // While filtering, only sections with results are shown; otherwise every
  // project and category is listed so tasks can be added anywhere.
  const groups = useMemo(
    () => groupTasksByProject(tree.roots, projectIndex, { includeEmpty: !filtering }),
    [tree.roots, projectIndex, filtering]
  );

  const isExpanded = (taskId) =>
    tree.autoExpandIds.has(taskId) ? !collapsedIds.has(taskId) : expandedIds.has(taskId);

  const handleToggleExpand = (taskId) =>
    toggleIn(tree.autoExpandIds.has(taskId) ? setCollapsedIds : setExpandedIds, taskId);

  useTaskShortcuts({
    enabled: !loading,
    listView,
    keyboardId,
    setKeyboardId,
    showKeys,
    setShowKeys,
    selection,
    deleteSelected,
    tasks,
    focusSearch: () => searchRef.current?.focus(),
    newTask: () => openNewTask(filters.project ? parseInt(filters.project, 10) : null),
    edit: handleEditTask,
    addSubtask: handleAddSubtask,
    toggleDone: handleToggleDone,
    deleteTask: handleDeleteTask,
    togglePin,
  });

  if (loading) return <div className="container"><p>{t('Loading tasks…')}</p></div>;

  const visibleRoots = tree.roots;
  const canDrag = filters.sort === 'manual';
  // Filtering by status "done" or searching opens the Completed rows, so
  // results are never hidden behind them.
  const completedAutoOpen = filters.status === 'done' || filters.q.trim() !== '';

  // Edit / Add subtask from a row: the form opens right below that task (list
  // view). New tasks, and edits started from the board, use the top.
  const inlineTargetId = showForm && listView ? selectedTask?.id ?? parentTaskForNew?.id ?? null : null;

  const taskForm = showForm && (
    <TaskForm
      key={`${selectedTask?.id}-${parentTaskForNew?.id}-${projectForNew}`}
      task={selectedTask}
      parentTask={parentTaskForNew}
      defaultProjectId={projectForNew}
      projectIndex={projectIndex}
      users={users}
      labels={labels}
      onLabelCreated={(l) => setLabels((ls) => [...ls, l])}
      allTasks={tasks}
      onSubmit={selectedTask ? handleUpdateTask : handleCreateTask}
      onBulkSubmit={handleBulkCreate}
      templates={templates}
      onTemplateSubmit={handleTemplateCreate}
      onCancel={closeForm}
    />
  );
  const inlineForm = inlineTargetId != null ? { taskId: inlineTargetId, element: taskForm } : null;

  const renderTask = (task) => (
    <TaskItem
      key={task.id}
      task={task}
      onEdit={handleEditTask}
      onDelete={handleDeleteTask}
      onAddSubtask={handleAddSubtask}
      onReorder={handleReorder}
      isExpanded={isExpanded}
      onToggleExpand={handleToggleExpand}
      onToggleDone={handleToggleDone}
      onCommentCount={handleCommentCount}
      childrenOf={tree.childrenOf}
      matchedIds={tree.matchedIds}
      searchText={filters.q}
      canDrag={canDrag && !inlineForm && !selection.active}
      progressOf={tree.progressOf}
      focusCommentsId={focusCommentsId}
      projectIndex={projectIndex}
      getMoveState={getMoveState}
      onMove={handleMove}
      onMoveTo={handleMoveTo}
      labelIndex={labelIndex}
      onLabelClick={filterByLabel}
      dependencyIndex={dependencyIndex}
      inlineForm={inlineForm}
      remainingOf={remainingOf}
      keyboardId={keyboardId}
      onSaveTemplate={handleSaveTemplate}
      selection={selection.active ? { ids: selection.ids, toggle: selection.toggle } : null}
      isPinned={pins.has}
      onTogglePin={togglePin}
    />
  );

  return (
    <div className="container">
      <div className="task-list-header">
        <div className="header-left">
          <h1>{t('Tasks')}</h1>
          <span className="task-count">
            ({filtering ? t('{n} of {total}', { n: visibleRoots.length, total: tree.totalRoots }) : tree.totalRoots})
          </span>
        </div>
        <div className="header-actions tasks-header-actions">
          <div className="view-switch" role="group" aria-label={t('View')}>
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={filters.view === v.id ? 'active' : ''}
                aria-pressed={filters.view === v.id}
                onClick={() => setView(v.id)}
              >
                {v.label()}
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => openNewTask(filters.project ? parseInt(filters.project, 10) : null)}
          >
            {t('+ New Task')}
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showForm && !inlineForm && <div className="form-container">{taskForm}</div>}

      <FilterBar
        filters={filters}
        setFilter={setFilter}
        clearFilters={clearFilters}
        filtering={filtering}
        searchRef={searchRef}
        myOpenCount={myOpenCount}
        selection={selection}
        saved={saved}
        projectIndex={projectIndex}
        labelIndex={labelIndex}
        users={users}
        currentUser={currentUser}
      />

      {tree.archivedCount > 0 && (
        <p className="archive-note">
          {tn(
            tree.archivedCount,
            'One task completed more than {days} days ago is archived.',
            '{n} tasks completed more than {days} days ago are archived.',
            { days: archiveAfterDays }
          )}{' '}
          <button className="link-btn" onClick={() => setFilter('status', 'done')}>
            {t('Show done tasks')}
          </button>{' '}
          {t('or search to find them.')}
        </p>
      )}

      {filters.view === 'board' && (
        <TaskBoard
          roots={visibleRoots}
          projectIndex={projectIndex}
          users={users}
          progressOf={tree.progressOf}
          onSetStatus={handleSetStatus}
          labelIndex={labelIndex}
          onLabelClick={filterByLabel}
          dependencyIndex={dependencyIndex}
          onOpen={openInList}
          onEdit={(task) => {
            handleEditTask(task);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {filters.view === 'timeline' && (
        <TaskTimeline
          tasks={flattenVisible(tree)}
          projectIndex={projectIndex}
          onOpen={openInList}
          onChangeDates={handleChangeDates}
        />
      )}

      {filters.view === 'calendar' && (
        <TaskCalendar
          tasks={flattenVisible(tree)}
          projectIndex={projectIndex}
          onOpen={openInList}
          onReschedule={handleReschedule}
        />
      )}

      {listView && (
        <>
          {selection.active && (
            <BulkEditBar
              count={selection.ids.size}
              onSelectAll={selection.selectAll}
              onClear={selection.clear}
              onExit={selection.exit}
              onApply={applyBulk}
              onDelete={deleteSelected}
              projectIndex={projectIndex}
              users={users}
              labels={labelIndex.list}
            />
          )}
          <div className={`task-list ${selection.active ? 'selecting' : ''}`}>
            <TaskGroups
              groups={groups}
              filtering={filtering}
              noResults={visibleRoots.length === 0 && filtering}
              clearFilters={clearFilters}
              collapsedGroups={collapsedGroups}
              toggleGroup={toggleGroup}
              openCompleted={openCompleted}
              toggleCompleted={(key) => toggleIn(setOpenCompleted, key)}
              completedAutoOpen={completedAutoOpen}
              allChildrenOf={allChildrenOf}
              openNewTask={openNewTask}
              renderTask={renderTask}
            />
          </div>
        </>
      )}

      <KeyboardHelp open={showKeys} setOpen={setShowKeys} />

      <UndoToast key={undo?.key} undo={undo} onClose={() => setUndo(null)} />
    </div>
  );
}

export default TaskList;
