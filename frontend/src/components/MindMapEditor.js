import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authFetch } from '../context/AuthContext';
import { buildProjectIndex } from '../projects';
import {
  BRANCH_COLORS, MAX_NODES, ROOT, SIZES, addChild, addSibling, canMove, childrenOf, edgePath, findNode, hitTest, layout,
  makeMeasure, moveNode, neighbour, newUuid, removeNode, reorder, subtreeIds, taskPlan, updateNode,
} from '../mindmap';
import { useSyncRefresh } from '../desktop/useSyncRefresh';
import { t, tn } from '../i18n';
import '../styles/MindMap.css';

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const SAVE_DELAY = 600;
const HISTORY = 100;
const json = { 'Content-Type': 'application/json' };

// Text widths from a canvas, in the page's font; cached per text.
function useMeasure() {
  return useMemo(() => {
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    const family = (typeof document !== 'undefined' && getComputedStyle(document.body).fontFamily) || 'sans-serif';
    const cache = new Map();
    const widthOf = (str, kind) => {
      const key = `${kind}\u0000${str}`;
      if (cache.has(key)) return cache.get(key);
      let w = str.length * SIZES[kind].font * 0.55;
      if (ctx) {
        ctx.font = `${kind === 'root' ? 600 : kind === 'branch' ? 500 : 400} ${SIZES[kind].font}px ${family}`;
        w = ctx.measureText(str).width;
      }
      cache.set(key, w);
      return w;
    };
    return makeMeasure(widthOf);
  }, []);
}

const flatten = (tasks) => tasks.flatMap((x) => [x, ...flatten(x.subtasks || [])]);

// One mind map: the map on a canvas (pan, zoom, drag ideas around) and a
// panel for the selected idea. Changes are saved a moment after they're made.
function MindMapEditor() {
  const { id } = useParams();
  const mapId = Number(id);
  const navigate = useNavigate();
  const [map, setMapState] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState(null); // null: not loaded yet
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(ROOT);
  const [editing, setEditingState] = useState(null); // { id, draft, fresh }
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [saveState, setSaveState] = useState('saved'); // saved | pending | saving | error
  const [drag, setDrag] = useState(null); // { id, wx, wy, target, side }
  const [busy, setBusy] = useState(false);

  const mapRef = useRef(null);
  const editRef = useRef(null);
  const viewRef = useRef(view);
  const history = useRef({ undo: [], redo: [] });
  const pending = useRef(null);
  const timer = useRef(null);
  const canvasRef = useRef(null);
  const pointer = useRef({ pointers: new Map(), pan: null, pinch: null, press: null });
  const fitted = useRef(false);
  const measure = useMeasure();
  viewRef.current = view;

  const setMap = (next) => {
    mapRef.current = next;
    setMapState(next);
  };
  const setEditing = (next) => {
    editRef.current = next;
    setEditingState(next);
  };

  // ------------------------------------------------------------ loading and saving

  /** Windows app: a map made offline gets its real id after a sync; find it by uid. */
  const idByUid = useCallback(async () => {
    const uid = mapRef.current?.uid;
    if (!uid) return null;
    const r = await authFetch('/api/mindmaps/');
    if (!r.ok) return null;
    return (await r.json()).find((m) => m.uid === uid)?.id ?? null;
  }, []);

  const relocate = useCallback(async () => {
    const real = await idByUid();
    if (real == null || real === mapId) return false;
    navigate(`/mindmaps/${real}`, { replace: true });
    return true;
  }, [idByUid, mapId, navigate]);

  const loadTasks = useCallback(async () => {
    const r = await authFetch('/api/tasks/');
    if (r.ok) setTasks(flatten(await r.json()));
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      // Never replace what is being typed or not saved yet.
      if (quiet && (pending.current || editRef.current)) return;
      try {
        const r = await authFetch(`/api/mindmaps/${mapId}`);
        if (r.status === 404) {
          if (await relocate()) return;
          setMap(null);
          setError(t('This mind map doesn’t exist (any more).'));
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (quiet && (pending.current || editRef.current)) return;
        setMap(data);
        setError(null);
        const p = await authFetch('/api/projects/');
        if (p.ok) setProjects(await p.json());
        await loadTasks();
      } catch (err) {
        setError(t('Could not load the mind map: {error}', { error: err.message }));
      }
    },
    [mapId, relocate, loadTasks]
  );

  useEffect(() => {
    fitted.current = false;
    history.current = { undo: [], redo: [] };
    setSelected(ROOT);
    setEditing(null);
    load();
  }, [load]);
  useSyncRefresh(() => load(true));

  const save = useCallback(async (target = mapId) => {
    clearTimeout(timer.current);
    timer.current = null;
    const body = pending.current;
    if (!body) return;
    pending.current = null;
    setSaveState('saving');
    try {
      const put = (to) => authFetch(`/api/mindmaps/${to}`, { method: 'PUT', headers: json, body: JSON.stringify(body) });
      let r = await put(target);
      if (r.status === 404) {
        const real = await idByUid();
        if (real != null && real !== target) {
          r = await put(real);
          if (r.ok && real !== mapId) navigate(`/mindmaps/${real}`, { replace: true });
        }
      }
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${r.status}`);
      }
      setSaveState(pending.current ? 'pending' : 'saved');
    } catch (err) {
      pending.current = pending.current || body;
      setSaveState('error');
      setError(t('Could not save: {error}', { error: err.message }));
    }
  }, [mapId, idByUid, navigate]);

  // Save what's left when leaving the page (or the map).
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const id = mapId; // the map being left, also when the address changes
    const flush = () => saveRef.current(id);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [mapId]);

  /** Shows `next` ({ nodes, title }) and saves it shortly. */
  const apply = (next) => {
    const cur = mapRef.current;
    setMap({ ...cur, ...next, node_count: next.nodes.length });
    pending.current = { title: next.title, nodes: next.nodes };
    setSaveState('pending');
    setError(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => saveRef.current(), SAVE_DELAY);
  };

  const snapshot = () => ({ nodes: mapRef.current.nodes, title: mapRef.current.title });

  /** A change that undo can take back. */
  const commit = (nodes, title = mapRef.current.title) => {
    const h = history.current;
    h.undo = [...h.undo, snapshot()].slice(-HISTORY);
    h.redo = [];
    apply({ nodes, title });
  };

  const undo = () => {
    const h = history.current;
    if (!h.undo.length) return;
    h.redo.push(snapshot());
    apply(h.undo.pop());
  };
  const redo = () => {
    const h = history.current;
    if (!h.redo.length) return;
    h.undo.push(snapshot());
    apply(h.redo.pop());
  };

  // Something selected that no longer exists (undo, a sync): back to the centre.
  useEffect(() => {
    if (map && selected !== ROOT && !findNode(map.nodes, selected)) setSelected(ROOT);
  }, [map, selected]);

  // ------------------------------------------------------------ derived

  const index = useMemo(() => buildProjectIndex(projects), [projects]);
  const tasksByUid = useMemo(() => new Map((tasks || []).map((x) => [x.uid, x])), [tasks]);
  // Linked tasks count as deleted only once the task list is there.
  const taskGone = (uid) => tasks !== null && !tasksByUid.has(uid);
  const nodes = map?.nodes || [];
  const lay = useMemo(() => {
    if (!map) return null;
    const override = editing ? { [editing.id]: editing.draft } : {};
    const badges = (n) => (n.note ? 1 : 0) + (n.task_uid ? 1 : 0);
    return layout(map.title, map.nodes, measure, { badges, override });
  }, [map, editing, measure]);

  const project = map ? index.byId.get(map.project_id) : null;
  const topProject = map ? index.topOf(map.project_id) : null;
  const projectLabel = project ? (topProject && topProject.id !== project.id ? `${topProject.name} › ${project.name}` : project.name) : '';
  const rootColor = topProject?.color || '#2196f3';

  // ------------------------------------------------------------ view

  const canvasRect = () => canvasRef.current?.getBoundingClientRect() || { left: 0, top: 0, width: 800, height: 500 };

  /** The whole map in view; `readable`: not smaller than 60 % (then around the centre). */
  const fit = useCallback(
    (readable = false) => {
      if (!lay || !canvasRef.current) return;
      const r = canvasRect();
      const { minX, minY, maxX, maxY } = lay.bounds;
      const zoom = Math.max(MIN_ZOOM, Math.min(1, (r.width - 60) / (maxX - minX || 1), (r.height - 60) / (maxY - minY || 1)));
      if (readable && zoom < 0.6) {
        setView({ zoom: 0.6, x: r.width / 2, y: r.height / 2 });
        return;
      }
      setView({ zoom, x: r.width / 2 - ((minX + maxX) / 2) * zoom, y: r.height / 2 - ((minY + maxY) / 2) * zoom });
    },
    [lay]
  );

  useEffect(() => {
    if (lay && !fitted.current) {
      fitted.current = true;
      fit(true);
    }
  }, [lay, fit]);

  const zoomAt = (factor, cx, cy) => {
    setView((v) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
      const k = zoom / v.zoom;
      return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  };
  const zoomCentre = (factor) => {
    const r = canvasRect();
    zoomAt(factor, r.width / 2, r.height / 2);
  };

  // Wheel: scroll pans, Ctrl/⌘ + wheel (and trackpad pinch) zooms.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        zoomAt(Math.exp(-e.deltaY * 0.0025), e.clientX - r.left, e.clientY - r.top);
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [map !== null]); // eslint-disable-line react-hooks/exhaustive-deps -- once the canvas is there

  // Keep the selected idea on screen when moving with the keyboard.
  useEffect(() => {
    const p = lay?.pos.get(selected);
    if (!p || !canvasRef.current) return;
    const r = canvasRect();
    const v = viewRef.current;
    const left = p.x * v.zoom + v.x;
    const top = p.y * v.zoom + v.y;
    const right = left + p.w * v.zoom;
    const bottom = top + p.h * v.zoom;
    const m = 30;
    let dx = 0;
    let dy = 0;
    if (left < m) dx = m - left;
    else if (right > r.width - m) dx = r.width - m - right;
    if (top < m) dy = m - top;
    else if (bottom > r.height - m) dy = r.height - m - bottom;
    if (dx || dy) setView((cur) => ({ ...cur, x: cur.x + dx, y: cur.y + dy }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, lay]);

  const toWorld = (clientX, clientY) => {
    const r = canvasRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  };

  // ------------------------------------------------------------ editing

  const focusCanvas = () => canvasRef.current?.focus({ preventScroll: true });

  const startEdit = (nid, initial) => {
    if (!mapRef.current) return;
    const n = findNode(mapRef.current.nodes, nid);
    const text = nid === ROOT ? mapRef.current.title : n?.text || '';
    setSelected(nid);
    setEditing({ id: nid, draft: initial ?? text, fresh: false });
  };

  const add = (kind, from = selected) => {
    const cur = mapRef.current;
    if (!cur) return;
    if (cur.nodes.length >= MAX_NODES) {
      window.alert(tn(MAX_NODES, 'At most one idea per mind map.', 'At most {n} ideas per mind map.'));
      return;
    }
    const r = kind === 'child' || from === ROOT ? addChild(cur.nodes, from) : addSibling(cur.nodes, from);
    commit(r.nodes);
    setSelected(r.id);
    setEditing({ id: r.id, draft: '', fresh: true });
  };

  /** Ends typing: 'done', 'cancel', or 'child' / 'sibling' to go on with a new idea. */
  const finishEdit = (mode = 'done') => {
    const ed = editRef.current;
    if (!ed) return;
    setEditing(null);
    const cur = mapRef.current;
    const h = history.current;
    const text = ed.draft.replace(/^\s+|\s+$/g, '');
    let next = { nodes: cur.nodes, title: cur.title };
    let changed = false;

    if (ed.fresh && (mode === 'cancel' || !text)) {
      // A new idea left empty: as if it was never added.
      const before = h.undo.pop();
      if (before) apply(before);
      setSelected(findNode(cur.nodes, ed.id)?.parent ?? ROOT);
      focusCanvas();
      return;
    }
    if (mode !== 'cancel') {
      if (ed.id === ROOT) {
        const title = text.split(/\s+/).filter(Boolean).join(' ').slice(0, 200);
        if (title && title !== cur.title) {
          h.undo = [...h.undo, snapshot()].slice(-HISTORY);
          h.redo = [];
          next = { ...next, title };
          changed = true;
        }
      } else if (text && text !== findNode(cur.nodes, ed.id)?.text) {
        // A fresh idea's "before" is already on the undo stack (from adding it).
        if (!ed.fresh) {
          h.undo = [...h.undo, snapshot()].slice(-HISTORY);
          h.redo = [];
        }
        next = { ...next, nodes: updateNode(cur.nodes, ed.id, { text: text.slice(0, 500) }) };
        changed = true;
      }
    }
    if (mode === 'child' || mode === 'sibling') {
      if (next.nodes.length < MAX_NODES) {
        h.undo = [...h.undo, next].slice(-HISTORY);
        h.redo = [];
        const r = mode === 'child' || ed.id === ROOT ? addChild(next.nodes, ed.id) : addSibling(next.nodes, ed.id);
        next = { ...next, nodes: r.nodes };
        changed = true;
        setSelected(r.id);
        setEditing({ id: r.id, draft: '', fresh: true });
      }
    } else {
      focusCanvas();
    }
    if (changed) apply(next);
  };

  const remove = (nid = selected) => {
    if (nid === ROOT || !mapRef.current) return;
    const r = removeNode(mapRef.current.nodes, nid);
    commit(r.nodes);
    setSelected(r.next);
  };

  const toggle = (nid = selected) => {
    const n = findNode(mapRef.current?.nodes || [], nid);
    if (!n || !childrenOf(mapRef.current.nodes, nid).length) return;
    commit(updateNode(mapRef.current.nodes, nid, { collapsed: !n.collapsed }));
  };

  const onKeyDown = (e) => {
    if (editRef.current || !lay) return;
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && k.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    if (mod) return;
    if (k === 'Tab') {
      e.preventDefault();
      add('child');
    } else if (k === 'Enter') {
      e.preventDefault();
      add('sibling');
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      remove();
    } else if (k === 'F2') {
      e.preventDefault();
      startEdit(selected);
    } else if (k === ' ') {
      e.preventDefault();
      toggle();
    } else if (k.startsWith('Arrow')) {
      e.preventDefault();
      if (e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) {
        if (selected !== ROOT) commit(reorder(mapRef.current.nodes, selected, k === 'ArrowUp' ? -1 : 1));
      } else {
        setSelected(neighbour(nodes, lay.pos, selected, k));
      }
    } else if (k === 'Escape') {
      setSelected(ROOT);
    } else if (k.length === 1 && !e.altKey) {
      // Typing on a selected idea replaces its text.
      e.preventDefault();
      startEdit(selected, k);
    }
  };

  const onEditKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      finishEdit('cancel');
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finishEdit('done');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      finishEdit('child');
    }
  };

  // ------------------------------------------------------------ pointer

  const onNodePointerDown = (e, nid) => {
    if (editRef.current?.id === nid) return; // clicks inside the text box
    e.stopPropagation();
    if (editRef.current) finishEdit('done');
    if (e.button !== undefined && e.button !== 0) return;
    setSelected(nid);
    focusCanvas();
    pointer.current.press = { id: nid, sx: e.clientX, sy: e.clientY, started: false, pointerId: e.pointerId };
    try {
      canvasRef.current.setPointerCapture(e.pointerId);
    } catch {
      // not supported: dragging still works while the pointer stays on the canvas
    }
  };

  const onPointerDown = (e) => {
    if (editRef.current) finishEdit('done');
    const st = pointer.current;
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      canvasRef.current.setPointerCapture(e.pointerId);
    } catch {
      // see above
    }
    if (st.pointers.size === 2) {
      const [a, b] = [...st.pointers.values()];
      st.pan = null;
      st.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: viewRef.current.zoom };
    } else {
      st.pan = { sx: e.clientX, sy: e.clientY, vx: viewRef.current.x, vy: viewRef.current.y };
    }
  };

  const onPointerMove = (e) => {
    const st = pointer.current;
    if (st.press && st.press.pointerId === e.pointerId) {
      const { press } = st;
      if (!press.started && Math.hypot(e.clientX - press.sx, e.clientY - press.sy) > 6 && press.id !== ROOT) press.started = true;
      if (press.started && lay) {
        const w = toWorld(e.clientX, e.clientY);
        const skip = subtreeIds(nodes, press.id);
        const target = hitTest(lay.pos, w.x, w.y, skip);
        setDrag({ id: press.id, wx: w.x, wy: w.y, target, side: w.x < 0 ? 'left' : 'right' });
      }
      return;
    }
    if (!st.pointers.has(e.pointerId)) return;
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.pinch && st.pointers.size >= 2) {
      const [a, b] = [...st.pointers.values()];
      const r = canvasRect();
      const factor = (st.pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / st.pinch.dist)) / viewRef.current.zoom;
      zoomAt(factor, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    } else if (st.pan) {
      setView((v) => ({ ...v, x: st.pan.vx + e.clientX - st.pan.sx, y: st.pan.vy + e.clientY - st.pan.sy }));
    }
  };

  const onPointerUp = (e) => {
    const st = pointer.current;
    if (st.press && st.press.pointerId === e.pointerId) {
      const { press } = st;
      st.press = null;
      if (press.started && drag) {
        const cur = mapRef.current.nodes;
        const n = findNode(cur, press.id);
        if (drag.target && canMove(cur, press.id, drag.target) && drag.target !== n?.parent && !(drag.target === ROOT && n?.parent == null)) {
          commit(moveNode(cur, press.id, drag.target, drag.target === ROOT ? drag.side : null));
        } else if ((drag.target === ROOT || !drag.target) && n && n.parent == null && lay.pos.get(n.id)?.side !== drag.side) {
          // A main branch dropped on the other side of the centre.
          commit(updateNode(cur, press.id, { side: drag.side }));
        }
      }
      setDrag(null);
      return;
    }
    st.pointers.delete(e.pointerId);
    if (st.pointers.size < 2) st.pinch = null;
    if (st.pointers.size === 0) st.pan = null;
  };

  // ------------------------------------------------------------ tasks

  const makeTasks = async (nid, withChildren) => {
    const cur = mapRef.current;
    const plan = taskPlan(cur.nodes, nid, withChildren);
    if (!plan) return;
    setBusy(true);
    const links = {};
    try {
      const create = async (item, parentId) => {
        const uid = newUuid();
        const body = { uid, title: item.title, description: item.description };
        if (parentId == null) body.project_id = cur.project_id;
        else body.parent_task_id = parentId;
        const r = await authFetch('/api/tasks/', { method: 'POST', headers: json, body: JSON.stringify(body) });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `HTTP ${r.status}`);
        links[item.id] = uid;
        for (const c of item.children) await create(c, data.id);
      };
      await create(plan, null);
    } catch (err) {
      setError(t('Could not create the task: {error}', { error: err.message }));
    }
    if (Object.keys(links).length) {
      commit(mapRef.current.nodes.map((n) => (links[n.id] ? { ...n, task_uid: links[n.id] } : n)));
      await loadTasks();
    }
    setBusy(false);
  };

  const deleteMap = async () => {
    if (!window.confirm(t('Delete the mind map “{title}” with all its ideas? Tasks made from it stay.', { title: map.title }))) return;
    clearTimeout(timer.current);
    pending.current = null;
    const r = await authFetch(`/api/mindmaps/${mapId}`, { method: 'DELETE' });
    if (r.ok) navigate(map ? `/mindmaps?project=${topProject?.id ?? ''}` : '/mindmaps');
    else setError(t('Could not delete the mind map.'));
  };

  const moveToProject = async (pid) => {
    if (!pid || pid === map.project_id) return;
    await save();
    const r = await authFetch(`/api/mindmaps/${mapId}`, { method: 'PUT', headers: json, body: JSON.stringify({ project_id: pid }) });
    if (r.ok) setMap({ ...mapRef.current, project_id: pid });
    else setError(t('Could not move the mind map.'));
  };

  // ------------------------------------------------------------ render

  if (!map) {
    return (
      <div className="container mindmap-page">
        <p>
          <Link to="/mindmaps">‹ {t('Mind maps')}</Link>
        </p>
        {error ? <p className="error-message">{error}</p> : <p>{t('Loading…')}</p>}
      </div>
    );
  }

  const sel = selected === ROOT ? null : findNode(nodes, selected);
  const choices = index.topLevel.flatMap((p) => [
    { id: p.id, label: p.name },
    ...index.categoriesOf(p.id).map((c) => ({ id: c.id, label: `${p.name} › ${c.name}` })),
  ]);
  const saveText = { saved: t('Saved'), pending: t('Not saved yet'), saving: t('Saving…'), error: t('Not saved') }[saveState];

  const renderNode = ([nid, p]) => {
    const n = nid === ROOT ? null : findNode(nodes, nid);
    const isEditing = editing?.id === nid;
    const task = n?.task_uid ? tasksByUid.get(n.task_uid) : null;
    const kids = n ? childrenOf(nodes, nid).length : 0;
    const classes = ['mm-node', `mm-${p.kind}`];
    if (selected === nid) classes.push('selected');
    if (drag?.target === nid) classes.push('drop-target');
    if (drag?.id === nid) classes.push('dragging');
    if (task?.status === 'done') classes.push('mm-done');
    const color = nid === ROOT ? rootColor : p.color;
    return (
      <div
        key={nid}
        data-node={nid}
        className={classes.join(' ')}
        style={{ left: p.x, top: p.y, width: p.w, height: p.h, '--mm-color': color }}
        onPointerDown={(e) => onNodePointerDown(e, nid)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEdit(nid);
        }}
        title={n?.note || undefined}
      >
        {isEditing ? (
          <textarea
            className="mm-input"
            autoFocus
            value={editing.draft}
            maxLength={nid === ROOT ? 200 : 500}
            onChange={(e) => setEditing({ ...editRef.current, draft: e.target.value })}
            onKeyDown={onEditKey}
            onBlur={() => finishEdit('done')}
            onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
            aria-label={nid === ROOT ? t('Topic') : t('Idea')}
          />
        ) : (
          <span className="mm-text">{p.lines.join('\n') || ' '}</span>
        )}
        {n?.note && (
          <span className="mm-badge" aria-label={t('Has a note')}>
            ≡
          </span>
        )}
        {n?.task_uid && (
          <span
            className={`mm-badge mm-task ${task?.status === 'done' ? 'done' : ''}`}
            title={task ? t('Task: {title}', { title: task.title }) : taskGone(n.task_uid) ? t('The task was deleted.') : undefined}
          >
            {task?.status === 'done' ? '✓' : taskGone(n.task_uid) ? '✕' : '☐'}
          </span>
        )}
        {kids > 0 && (
          <button
            type="button"
            className={`mm-toggle ${p.side}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggle(nid);
            }}
            title={n.collapsed ? t('Show the ideas below') : t('Hide the ideas below')}
            aria-label={n.collapsed ? t('Show the ideas below') : t('Hide the ideas below')}
          >
            {n.collapsed ? p.hiddenCount : '−'}
          </button>
        )}
      </div>
    );
  };

  const dragged = drag ? lay.pos.get(drag.id) : null;
  const linked = sel?.task_uid ? tasksByUid.get(sel.task_uid) : null;
  const countPlan = (item) => item.children.reduce((s, c) => s + 1 + countPlan(c), 0);
  const openKids = sel ? countPlan(taskPlan(nodes, sel.id, true)) : 0;

  return (
    <div className="container mindmap-page">
      <div className="task-list-header mindmap-header">
        <div className="header-left">
          <Link to={`/mindmaps${topProject ? `?project=${topProject.id}` : ''}`} className="mindmap-back" title={t('All mind maps')}>
            ‹
          </Link>
          <h1>{map.title}</h1>
          {projectLabel && (
            <span className="mindmap-project" style={{ borderColor: rootColor }}>
              {projectLabel}
            </span>
          )}
        </div>
        <span className={`mindmap-save ${saveState}`} role="status">
          {saveText}
        </span>
      </div>

      <div className="mindmap-toolbar" role="toolbar" aria-label={t('Mind map')}>
        <button className="btn btn-secondary btn-small" onClick={() => add('child')} title={t('New idea below the selected one (Tab)')}>
          {t('+ Idea')}
        </button>
        <button
          className="btn btn-secondary btn-small"
          onClick={() => add('sibling')}
          disabled={selected === ROOT}
          title={t('New idea next to the selected one (Enter)')}
        >
          {t('+ Next to it')}
        </button>
        <button className="btn btn-secondary btn-small" onClick={() => startEdit(selected)} title={t('Edit the text (F2 or double-click)')}>
          ✎
        </button>
        <button className="btn btn-secondary btn-small" onClick={() => remove()} disabled={selected === ROOT} title={t('Delete the idea with the ideas below it (Del)')}>
          🗑
        </button>
        <span className="mindmap-sep" />
        <button className="btn btn-secondary btn-small" onClick={undo} disabled={!history.current.undo.length} title={t('Undo (Ctrl+Z)')}>
          ↶
        </button>
        <button className="btn btn-secondary btn-small" onClick={redo} disabled={!history.current.redo.length} title={t('Redo (Ctrl+Y)')}>
          ↷
        </button>
        <span className="mindmap-sep" />
        <button className="btn btn-secondary btn-small" onClick={() => zoomCentre(1 / 1.2)} aria-label={t('Zoom out')} title={t('Zoom out')}>
          −
        </button>
        <span className="mindmap-zoom">{Math.round(view.zoom * 100)} %</span>
        <button className="btn btn-secondary btn-small" onClick={() => zoomCentre(1.2)} aria-label={t('Zoom in')} title={t('Zoom in')}>
          +
        </button>
        <button className="btn btn-secondary btn-small" onClick={() => fit()} title={t('Show the whole map')}>
          {t('Fit')}
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="mindmap-body">
        <div
          className="mindmap-canvas"
          ref={canvasRef}
          tabIndex={0}
          aria-label={t('Mind map')}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => add('child', ROOT)}
        >
          <div className="mindmap-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
            <svg className="mindmap-edges" width="1" height="1" aria-hidden="true">
              {lay.edges.map(([a, b]) => (
                <path key={`${a}-${b}`} d={edgePath(lay.pos.get(a), lay.pos.get(b))} stroke={lay.pos.get(b).color} />
              ))}
              {drag?.target && lay.pos.get(drag.target) && dragged && (
                <path
                  className="mm-drop-line"
                  d={edgePath(lay.pos.get(drag.target), {
                    ...dragged,
                    x: drag.wx,
                    y: drag.wy - dragged.h / 2,
                    side: drag.target === ROOT ? drag.side : lay.pos.get(drag.target).side,
                  })}
                />
              )}
            </svg>
            {[...lay.pos.entries()].map(renderNode)}
            {drag && dragged && (
              <div className="mm-node mm-ghost" style={{ left: drag.wx - dragged.w / 2, top: drag.wy - dragged.h / 2, width: dragged.w, height: dragged.h, '--mm-color': dragged.color }}>
                <span className="mm-text">{dragged.lines.join('\n')}</span>
              </div>
            )}
          </div>
          {nodes.length === 0 && !editing && (
            <p className="mindmap-hint">{t('Press Tab or double-click to add the first idea.')}</p>
          )}
        </div>

        <aside className="mindmap-panel">
          {!sel ? (
            <>
              <h2>{t('Mind map')}</h2>
              <label className="mindmap-field">
                <span>{t('Project')}</span>
                <select value={map.project_id} onChange={(e) => moveToProject(Number(e.target.value))}>
                  {!choices.some((c) => c.id === map.project_id) && <option value={map.project_id}>{projectLabel}</option>}
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mindmap-stats">
                {tn(nodes.length, 'one idea', '{n} ideas')} ·{' '}
                {tn(nodes.filter((n) => n.task_uid).length, 'one is a task', '{n} are tasks')}
              </p>
              <details className="mindmap-keys">
                <summary>{t('Keys')}</summary>
                <dl>
                  <dt>Tab</dt>
                  <dd>{t('new idea below')}</dd>
                  <dt>Enter</dt>
                  <dd>{t('new idea next to it')}</dd>
                  <dt>F2 / {t('typing')}</dt>
                  <dd>{t('edit the text')}</dd>
                  <dt>{t('Arrows')}</dt>
                  <dd>{t('move between ideas')}</dd>
                  <dt>Alt+↑/↓</dt>
                  <dd>{t('move up or down')}</dd>
                  <dt>{t('Space')}</dt>
                  <dd>{t('fold in or out')}</dd>
                  <dt>Del</dt>
                  <dd>{t('delete')}</dd>
                  <dt>Ctrl+Z / Ctrl+Y</dt>
                  <dd>{t('undo / redo')}</dd>
                  <dt>{t('Drag')}</dt>
                  <dd>{t('an idea onto another to move it there')}</dd>
                  <dt>Ctrl+{t('wheel')}</dt>
                  <dd>{t('zoom')}</dd>
                </dl>
              </details>
              <button className="btn btn-danger btn-small mindmap-delete" onClick={deleteMap}>
                {t('Delete mind map')}
              </button>
            </>
          ) : (
            <NodePanel
              key={sel.id}
              node={sel}
              linked={linked}
              gone={sel.task_uid ? taskGone(sel.task_uid) : false}
              openKids={openKids}
              busy={busy}
              onNote={(note) => commit(updateNode(mapRef.current.nodes, sel.id, { note: note || undefined }))}
              onColor={(color) => commit(updateNode(mapRef.current.nodes, sel.id, { color: color || undefined }))}
              onMakeTask={(withChildren) => makeTasks(sel.id, withChildren)}
              onOpenTask={() => navigate(`/?task=${linked.id}`)}
              onUnlink={() => commit(updateNode(mapRef.current.nodes, sel.id, { task_uid: undefined }))}
              onDelete={() => remove(sel.id)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

// The selected idea: note, colour, task.
function NodePanel({ node, linked, gone, openKids, busy, onNote, onColor, onMakeTask, onOpenTask, onUnlink, onDelete }) {
  const [note, setNote] = useState(node.note || '');
  useEffect(() => setNote(node.note || ''), [node.note]);
  const saveNote = () => {
    if ((note.trim() || '') !== (node.note || '')) onNote(note.trim());
  };
  const statusText = { todo: t('To Do'), in_progress: t('In Progress'), blocked: t('Blocked'), done: t('Done') };

  return (
    <>
      <h2 className="mindmap-node-title">{node.text || t('(empty)')}</h2>
      <label className="mindmap-field">
        <span>{t('Note')}</span>
        <textarea value={note} rows={4} maxLength={10000} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} placeholder={t('Details, links, open questions …')} />
      </label>
      <div className="mindmap-field">
        <span>{t('Colour')}</span>
        <div className="mindmap-colors">
          <button type="button" className={`mm-swatch none ${!node.color ? 'active' : ''}`} onClick={() => onColor(null)} title={t('Automatic')} aria-label={t('Automatic')}>
            ∅
          </button>
          {BRANCH_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              className={`mm-swatch ${node.color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => onColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <div className="mindmap-field">
        <span>{t('Task')}</span>
        {node.task_uid ? (
          linked ? (
            <div className="mindmap-task">
              <button type="button" className="mindmap-task-link" onClick={onOpenTask}>
                {linked.title}
              </button>
              <span className={`mindmap-task-status ${linked.status}`}>{statusText[linked.status] || linked.status}</span>
              <button type="button" className="btn btn-secondary btn-small" onClick={onUnlink}>
                {t('Unlink')}
              </button>
            </div>
          ) : !gone ? (
            <span className="mindmap-muted">{t('Loading…')}</span>
          ) : (
            <div className="mindmap-task">
              <span className="mindmap-muted">{t('The task was deleted.')}</span>
              <button type="button" className="btn btn-secondary btn-small" onClick={onUnlink}>
                {t('Unlink')}
              </button>
            </div>
          )
        ) : (
          <div className="mindmap-task">
            <button type="button" className="btn btn-primary btn-small" disabled={busy || !node.text.trim()} onClick={() => onMakeTask(false)}>
              {t('Make it a task')}
            </button>
            {openKids > 0 && (
              <button type="button" className="btn btn-secondary btn-small" disabled={busy || !node.text.trim()} onClick={() => onMakeTask(true)}>
                {tn(openKids, '… with one subtask', '… with {n} subtasks')}
              </button>
            )}
          </div>
        )}
      </div>
      <button type="button" className="btn btn-danger btn-small mindmap-delete" onClick={onDelete}>
        {t('Delete idea')}
      </button>
    </>
  );
}

export default MindMapEditor;
