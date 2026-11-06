// Mind maps (components/MindMapEditor.js): the tree operations and the
// layout, kept free of React so they can be tested on their own.
//
// A map is its title (the centre, ROOT) plus a flat list of nodes:
// { id, parent, text, note, color, side, collapsed, task_uid }. `parent` is
// null for main branches. Siblings keep the order of the list. Every
// operation returns a new list and never changes the one it was given.

export const ROOT = '@root'; // never a node id (the server only allows [A-Za-z0-9_-])
export const MAX_NODES = 1000;

// Branch colours: main branches take them in turn unless they have their own.
export const BRANCH_COLORS = ['#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#e91e63', '#009688', '#f44336', '#3f51b5'];

export function newId() {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

const parentKey = (id) => (id === ROOT ? null : id);

export function childrenOf(nodes, parentId) {
  const key = parentKey(parentId);
  return nodes.filter((n) => (n.parent ?? null) === key);
}

export function findNode(nodes, id) {
  return nodes.find((n) => n.id === id) || null;
}

/** Ids of `id` and everything below it. */
export function subtreeIds(nodes, id) {
  const out = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parent != null && out.has(n.parent) && !out.has(n.id)) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return out;
}

/** Index after the last node of `parentId`'s subtree, so new children come last. */
function endOfSubtree(nodes, parentId) {
  if (parentId === ROOT) return nodes.length;
  const ids = subtreeIds(nodes, parentId);
  let last = nodes.findIndex((n) => n.id === parentId);
  nodes.forEach((n, i) => {
    if (ids.has(n.id)) last = Math.max(last, i);
  });
  return last + 1;
}

export function addChild(nodes, parentId, fields = {}) {
  const node = { id: newId(), parent: parentKey(parentId), text: '', ...fields };
  const at = endOfSubtree(nodes, parentId);
  const out = [...nodes.slice(0, at), node, ...nodes.slice(at)];
  // A collapsed parent opens, so the new idea can be seen.
  return { nodes: out.map((n) => (n.id === parentId && n.collapsed ? { ...n, collapsed: false } : n)), id: node.id };
}

/** A new idea right after `id`, with the same parent (and side, for main branches). */
export function addSibling(nodes, id, fields = {}) {
  const ref = findNode(nodes, id);
  if (!ref) return addChild(nodes, ROOT, fields);
  const node = { id: newId(), parent: ref.parent ?? null, text: '', ...fields };
  if (ref.parent == null && ref.side) node.side = ref.side;
  const at = endOfSubtree(nodes, id);
  return { nodes: [...nodes.slice(0, at), node, ...nodes.slice(at)], id: node.id };
}

export function updateNode(nodes, id, patch) {
  return nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
}

/** Removes `id` with everything below it; `next` is what to select afterwards. */
export function removeNode(nodes, id) {
  const ref = findNode(nodes, id);
  if (!ref) return { nodes, next: ROOT };
  const gone = subtreeIds(nodes, id);
  const siblings = childrenOf(nodes, ref.parent ?? ROOT);
  const i = siblings.findIndex((n) => n.id === id);
  const neighbour = siblings[i + 1] || siblings[i - 1];
  return {
    nodes: nodes.filter((n) => !gone.has(n.id)),
    next: neighbour ? neighbour.id : ref.parent ?? ROOT,
  };
}

/** Can `id` go under `target`? Not under itself or its own ideas. */
export function canMove(nodes, id, target) {
  if (id === ROOT) return false;
  if (target === ROOT) return true;
  return !subtreeIds(nodes, id).has(target) && !!findNode(nodes, target);
}

/**
 * Moves `id` (with its ideas) under `target` as its last child. Moving to
 * ROOT makes it a main branch on `side` ('left' / 'right'; null: automatic).
 */
export function moveNode(nodes, id, target, side = null) {
  if (!canMove(nodes, id, target)) return nodes;
  const ids = subtreeIds(nodes, id);
  const moving = nodes.filter((n) => ids.has(n.id));
  const rest = nodes.filter((n) => !ids.has(n.id));
  const [head, ...below] = moving;
  const moved = { ...head, parent: parentKey(target) };
  delete moved.side;
  if (target === ROOT && side) moved.side = side;
  const at = endOfSubtree(rest, target);
  const out = [...rest.slice(0, at), moved, ...below, ...rest.slice(at)];
  return out.map((n) => (n.id === target && n.collapsed ? { ...n, collapsed: false } : n));
}

/** Swaps `id` with its previous (delta -1) or next (+1) sibling on the same side. */
export function reorder(nodes, id, delta) {
  const ref = findNode(nodes, id);
  if (!ref) return nodes;
  let siblings = childrenOf(nodes, ref.parent ?? ROOT);
  if (ref.parent == null) {
    const sides = sidesOf(nodes);
    siblings = siblings.filter((n) => sides.get(n.id) === sides.get(id));
  }
  const i = siblings.findIndex((n) => n.id === id);
  const other = siblings[i + delta];
  if (!other) return nodes;
  // Swap the two subtrees' blocks in the list.
  const a = delta < 0 ? other : ref;
  const b = delta < 0 ? ref : other;
  const aIds = subtreeIds(nodes, a.id);
  const bIds = subtreeIds(nodes, b.id);
  const aBlock = nodes.filter((n) => aIds.has(n.id));
  const bBlock = nodes.filter((n) => bIds.has(n.id));
  // a comes first in the list: b's block takes a's place and the other way round.
  const out = [];
  for (const n of nodes) {
    if (n.id === a.id) out.push(...bBlock);
    else if (n.id === b.id) out.push(...aBlock);
    else if (!aIds.has(n.id) && !bIds.has(n.id)) out.push(n);
  }
  return out;
}

/**
 * Which side each main branch is on: its own `side`, else automatic —
 * each goes to the side with fewer ideas so far, right first.
 */
export function sidesOf(nodes) {
  const sides = new Map();
  const weight = { left: 0, right: 0 };
  const size = (id) => subtreeIds(nodes, id).size;
  const main = childrenOf(nodes, ROOT);
  // Fixed ones first, so automatic ones fill up the lighter side.
  for (const n of main) if (n.side) weight[n.side] += size(n.id);
  for (const n of main) {
    if (n.side) {
      sides.set(n.id, n.side);
    } else {
      const side = weight.right <= weight.left ? 'right' : 'left';
      sides.set(n.id, side);
      weight[side] += size(n.id);
    }
  }
  return sides;
}

/** Each node's colour: its own, else its main branch's (own or from BRANCH_COLORS). */
export function colorsOf(nodes) {
  const colors = new Map();
  childrenOf(nodes, ROOT).forEach((n, i) => colors.set(n.id, n.color || BRANCH_COLORS[i % BRANCH_COLORS.length]));
  const visit = (parent) => {
    for (const c of childrenOf(nodes, parent)) {
      if (!colors.has(c.id)) colors.set(c.id, c.color || colors.get(parent));
      visit(c.id);
    }
  };
  for (const n of childrenOf(nodes, ROOT)) visit(n.id);
  return colors;
}

/**
 * Splits `text` into lines no wider than `maxWidth` (by `widthOf`), at
 * spaces where possible; line breaks in the text are kept.
 */
export function wrapText(text, maxWidth, widthOf) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    let line = '';
    for (const word of para.split(/ +/)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (!line || widthOf(tryLine) <= maxWidth) {
        line = tryLine;
      } else {
        out.push(line);
        line = word;
      }
      // A single word wider than the box is cut.
      while (widthOf(line) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && widthOf(line.slice(0, cut)) > maxWidth) cut -= 1;
        out.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    out.push(line);
  }
  return out;
}

export const SIZES = {
  root: { font: 18, line: 24, padX: 18, padY: 12, maxWidth: 260, minWidth: 80 },
  branch: { font: 15, line: 20, padX: 12, padY: 7, maxWidth: 220, minWidth: 40 },
  leaf: { font: 14, line: 19, padX: 10, padY: 5, maxWidth: 220, minWidth: 30 },
};
export const BADGE_WIDTH = 18;

/**
 * measure(text, kind, badges) -> { w, h, lines } from a text-width function
 * (canvas measureText in the browser, a character count in tests).
 */
export function makeMeasure(widthOf) {
  return (text, kind, badges = 0) => {
    const s = SIZES[kind];
    const lines = wrapText(text || ' ', s.maxWidth, (str) => widthOf(str, kind));
    const textW = Math.max(...lines.map((l) => widthOf(l, kind)));
    return {
      lines,
      // + borders and a little slack, so the text never gets cut off.
      w: Math.ceil(Math.max(s.minWidth, textW) + 2 * s.padX + badges * BADGE_WIDTH + 8),
      h: lines.length * s.line + 2 * s.padY,
    };
  };
}

export const H_GAP = 44;
export const V_GAP = 12;

/**
 * Positions for the centre and every visible node: Map id -> { x, y, w, h,
 * lines, side, depth, kind, color, hiddenCount }. (x, y) is the top-left
 * corner; the centre sits around (0, 0). `badges(node)` says how many
 * small icons a node shows next to its text. `edges` lists [parent, child].
 */
export function layout(title, nodes, measure, { badges = () => 0, override = {} } = {}) {
  const text = (id, fallback) => (id in override ? override[id] : fallback);
  const sides = sidesOf(nodes);
  const colors = colorsOf(nodes);
  const pos = new Map();
  const edges = [];

  const rootBox = measure(text(ROOT, title), 'root');
  pos.set(ROOT, { x: -rootBox.w / 2, y: -rootBox.h / 2, ...rootBox, side: null, depth: 0, kind: 'root', color: null });

  const kids = new Map();
  for (const n of nodes) {
    const key = n.parent ?? ROOT;
    if (!kids.has(key)) kids.set(key, []);
    kids.get(key).push(n);
  }
  const visibleKids = (n) => (n.collapsed ? [] : kids.get(n.id) || []);
  const hiddenCount = (n) => (n.collapsed ? subtreeIds(nodes, n.id).size - 1 : 0);

  const box = new Map();
  const sizeOf = (n, depth) => {
    const kind = depth === 1 ? 'branch' : 'leaf';
    const b = measure(text(n.id, n.text), kind, badges(n));
    const children = visibleKids(n).map((c) => sizeOf(c, depth + 1));
    const childH = children.reduce((s, c) => s + c, 0) + V_GAP * Math.max(0, children.length - 1);
    box.set(n.id, { ...b, kind, block: Math.max(b.h, childH), childH });
    return Math.max(b.h, childH);
  };

  const place = (n, depth, side, parentBox, top) => {
    const b = box.get(n.id);
    const x = side === 'right' ? parentBox.x + parentBox.w + H_GAP : parentBox.x - H_GAP - b.w;
    const y = top + (b.block - b.h) / 2;
    const p = { x, y, w: b.w, h: b.h, lines: b.lines, side, depth, kind: b.kind, color: colors.get(n.id), hiddenCount: hiddenCount(n) };
    pos.set(n.id, p);
    let childTop = top + (b.block - b.childH) / 2;
    for (const c of visibleKids(n)) {
      edges.push([n.id, c.id]);
      place(c, depth + 1, side, p, childTop);
      childTop += box.get(c.id).block + V_GAP;
    }
  };

  for (const side of ['right', 'left']) {
    const main = (kids.get(ROOT) || []).filter((n) => sides.get(n.id) === side);
    const blocks = main.map((n) => sizeOf(n, 1));
    const total = blocks.reduce((s, h) => s + h, 0) + V_GAP * 2 * Math.max(0, main.length - 1);
    let top = -total / 2;
    main.forEach((n, i) => {
      edges.push([ROOT, n.id]);
      place(n, 1, side, pos.get(ROOT), top);
      top += blocks[i] + V_GAP * 2;
    });
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + p.w);
    maxY = Math.max(maxY, p.y + p.h);
  }
  return { pos, edges, bounds: { minX, minY, maxX, maxY } };
}

/** SVG path for the line from a parent's box to a child's box. */
export function edgePath(parent, child) {
  const right = child.side === 'right';
  const x1 = right ? parent.x + parent.w : parent.x;
  const y1 = parent.y + parent.h / 2;
  const x2 = right ? child.x : child.x + child.w;
  const y2 = child.y + child.h / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}

/**
 * The node an arrow key leads to: outwards to the first child, inwards to
 * the parent, up/down to the neighbouring sibling (or the nearest visible
 * node above/below on the same side).
 */
export function neighbour(nodes, pos, id, key) {
  const p = pos.get(id);
  if (!p) return ROOT;
  if (id === ROOT) {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return ROOT;
    const side = key === 'ArrowRight' ? 'right' : 'left';
    const first = childrenOf(nodes, ROOT).find((n) => pos.get(n.id)?.side === side);
    return first ? first.id : ROOT;
  }
  const n = findNode(nodes, id);
  const outward = (p.side === 'right' && key === 'ArrowRight') || (p.side === 'left' && key === 'ArrowLeft');
  const inward = (p.side === 'right' && key === 'ArrowLeft') || (p.side === 'left' && key === 'ArrowRight');
  if (outward) {
    const c = childrenOf(nodes, id).find((x) => pos.has(x.id));
    return c ? c.id : id;
  }
  if (inward) return n.parent ?? ROOT;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const down = key === 'ArrowDown';
    const cy = p.y + p.h / 2;
    let best = null;
    let bestD = Infinity;
    for (const [oid, o] of pos) {
      if (oid === ROOT || oid === id || o.side !== p.side) continue;
      const oy = o.y + o.h / 2;
      if (down ? oy <= cy : oy >= cy) continue;
      // Prefer the same depth, then the closest vertically.
      const d = Math.abs(oy - cy) + Math.abs(o.depth - p.depth) * 1000;
      if (d < bestD) {
        bestD = d;
        best = oid;
      }
    }
    return best || id;
  }
  return id;
}

/** Ideas (with their sub-ideas, in order) to turn into tasks, skipping those that already are. */
export function taskPlan(nodes, id, withChildren) {
  const build = (n) => ({
    id: n.id,
    title: (n.text || '').trim() || '…',
    description: n.note || null,
    children: withChildren ? childrenOf(nodes, n.id).filter((c) => !c.task_uid).map(build) : [],
  });
  const n = findNode(nodes, id);
  return n ? build(n) : null;
}

/** A random UUID (v4), for tasks made from ideas (also offline). */
export function newUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The idea under world point (x, y), leaving out `skip` (ids being dragged). */
export function hitTest(pos, x, y, skip = new Set()) {
  let hit = null;
  for (const [id, p] of pos) {
    if (skip.has(id)) continue;
    if (x >= p.x - 4 && x <= p.x + p.w + 4 && y >= p.y - 4 && y <= p.y + p.h + 4) hit = id;
  }
  return hit;
}
