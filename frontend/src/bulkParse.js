// Parses "one task per line" text into a task tree for POST /api/tasks/bulk.
//
//   Order parts          -> task
//     Antenna modules    -> subtask of "Order parts" (indented: Tab or spaces)
//     - [x] Cables       -> subtask, bullet stripped, already done
//   Write guide          -> task
//
// Nesting follows indentation relative to the lines above, so uneven
// indentation (2 vs 4 spaces, tabs) still does the obvious thing.

const BULLET = /^(?:[-*•+]|\d+[.)])(?:\s+|$)/;
const CHECKBOX = /^\[( |x|X)\]\s*/;

function indentWidth(line) {
  let w = 0;
  for (const ch of line) {
    if (ch === ' ') w += 1;
    else if (ch === '\t') w += 4;
    else break;
  }
  return w;
}

export function parseBulk(text) {
  const roots = [];
  const stack = []; // [{ indent, node }]
  let count = 0;

  for (const raw of (text || '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const indent = indentWidth(raw);
    let title = raw.trim().replace(BULLET, '');
    let status;
    const box = title.match(CHECKBOX);
    if (box) {
      status = box[1].trim() ? 'done' : undefined;
      title = title.slice(box[0].length);
    }
    title = title.trim();
    if (!title) continue;

    const node = { title, children: [] };
    if (status) node.status = status;

    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();
    (stack.length ? stack[stack.length - 1].node.children : roots).push(node);
    stack.push({ indent, node });
    count += 1;
  }
  return { items: roots, count };
}

/** Number of tasks that end up as subtasks (anything below the top level). */
export const countNested = (items) => items.reduce((n, i) => n + i.children.length + countNested(i.children), 0);
