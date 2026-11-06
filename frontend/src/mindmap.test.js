import {
  ROOT, addChild, addSibling, canMove, childrenOf, colorsOf, edgePath, layout, makeMeasure, moveNode, neighbour,
  removeNode, reorder, sidesOf, subtreeIds, taskPlan, updateNode, wrapText, BRANCH_COLORS,
} from './mindmap';

const measure = makeMeasure((s) => s.length * 7);
const ids = (nodes) => nodes.map((n) => n.id);

const sample = () => [
  { id: 'a', parent: null, text: 'Marketing' },
  { id: 'a1', parent: 'a', text: 'Flyer' },
  { id: 'a2', parent: 'a', text: 'Posters' },
  { id: 'b', parent: null, text: 'Website' },
  { id: 'c', parent: null, text: 'Event', side: 'left' },
];

test('addChild puts the new idea after the parent subtree and opens a collapsed parent', () => {
  const nodes = updateNode(sample(), 'a', { collapsed: true });
  const { nodes: out, id } = addChild(nodes, 'a', { text: 'Radio' });
  expect(ids(out)).toEqual(['a', 'a1', 'a2', id, 'b', 'c']);
  expect(out.find((n) => n.id === 'a').collapsed).toBe(false);
  const top = addChild(sample(), ROOT);
  expect(out.length).toBe(6);
  expect(top.nodes[top.nodes.length - 1]).toMatchObject({ id: top.id, parent: null, text: '' });
});

test('addSibling follows the reference idea and keeps a main branch side', () => {
  const { nodes, id } = addSibling(sample(), 'a1');
  expect(ids(nodes)).toEqual(['a', 'a1', id, 'a2', 'b', 'c']);
  const s = addSibling(sample(), 'c');
  expect(s.nodes.find((n) => n.id === s.id).side).toBe('left');
});

test('removeNode takes the sub-ideas along and picks a neighbour', () => {
  const { nodes, next } = removeNode(sample(), 'a');
  expect(ids(nodes)).toEqual(['b', 'c']);
  expect(next).toBe('b');
  expect(removeNode(sample(), 'a2').next).toBe('a1');
  expect(removeNode([{ id: 'x', parent: null }], 'x').next).toBe(ROOT);
});

test('moveNode refuses loops and moves whole subtrees', () => {
  expect(canMove(sample(), 'a', 'a1')).toBe(false);
  expect(canMove(sample(), 'a', 'a')).toBe(false);
  expect(moveNode(sample(), 'a', 'a1')).toEqual(sample());
  const out = moveNode(sample(), 'a', 'b');
  expect(ids(out)).toEqual(['b', 'a', 'a1', 'a2', 'c']);
  expect(out.find((n) => n.id === 'a').parent).toBe('b');
  const back = moveNode(out, 'a', ROOT, 'left');
  expect(back.find((n) => n.id === 'a')).toMatchObject({ parent: null, side: 'left' });
  expect(moveNode(back, 'a', 'c').find((n) => n.id === 'a').side).toBeUndefined();
});

test('reorder swaps whole sibling blocks', () => {
  expect(ids(reorder(sample(), 'a2', -1))).toEqual(['a', 'a2', 'a1', 'b', 'c']);
  expect(ids(reorder(sample(), 'a1', -1))).toEqual(ids(sample()));
  // Main branches swap only with neighbours on the same side: c (left) with b.
  expect(ids(reorder(sample(), 'c', -1))).toEqual(['a', 'a1', 'a2', 'c', 'b']);
});

test('sidesOf balances automatic branches around the fixed ones, right first', () => {
  const sides = sidesOf(sample());
  expect(sides.get('a')).toBe('right'); // c already weighs on the left
  expect(sides.get('b')).toBe('left'); // a's three ideas weigh more
  expect(sides.get('c')).toBe('left');
  const flipped = sidesOf(updateNode(sample(), 'c', { side: 'right' }));
  expect(flipped.get('a')).toBe('left');
  expect(flipped.get('b')).toBe('right');
});

test('colorsOf inherits the main branch colour unless a node has its own', () => {
  const nodes = updateNode(sample(), 'a2', { color: '#000000' });
  const colors = colorsOf(nodes);
  expect(colors.get('a')).toBe(BRANCH_COLORS[0]);
  expect(colors.get('a1')).toBe(BRANCH_COLORS[0]);
  expect(colors.get('a2')).toBe('#000000');
  expect(colors.get('b')).toBe(BRANCH_COLORS[1]);
});

test('wrapText breaks at spaces, keeps line breaks and cuts long words', () => {
  const w = (s) => s.length;
  expect(wrapText('one two three', 7, w)).toEqual(['one two', 'three']);
  expect(wrapText('a\nb', 10, w)).toEqual(['a', 'b']);
  expect(wrapText('abcdefghij', 4, w)).toEqual(['abcd', 'efgh', 'ij']);
});

test('layout places branches left and right of the centre without overlaps', () => {
  const { pos, edges, bounds } = layout('Launch', sample(), measure);
  const root = pos.get(ROOT);
  expect(root.x + root.w / 2).toBeCloseTo(0);
  expect(pos.get('a').x).toBeGreaterThan(root.x + root.w);
  expect(pos.get('b').x + pos.get('b').w).toBeLessThan(root.x);
  expect(pos.get('a1').x).toBeGreaterThan(pos.get('a').x + pos.get('a').w);
  expect(pos.get('a1').y + pos.get('a1').h).toBeLessThanOrEqual(pos.get('a2').y);
  expect(edges).toContainEqual([ROOT, 'a']);
  expect(edges).toContainEqual(['a', 'a2']);
  expect(bounds.minX).toBeLessThan(0);
  // right-side boxes never overlap vertically
  const right = [...pos.entries()].filter(([id, p]) => id !== ROOT && p.side === 'right' && p.depth === 1).map(([, p]) => p);
  right.sort((x, y) => x.y - y.y);
  for (let i = 1; i < right.length; i += 1) expect(right[i].y).toBeGreaterThanOrEqual(right[i - 1].y + right[i - 1].h);
});

test('layout hides collapsed ideas and counts them', () => {
  const { pos } = layout('M', updateNode(sample(), 'a', { collapsed: true }), measure);
  expect(pos.has('a1')).toBe(false);
  expect(pos.get('a').hiddenCount).toBe(2);
});

test('layout uses the text being typed and room for badges', () => {
  const plain = layout('M', sample(), measure).pos.get('b').w;
  const typed = layout('M', sample(), measure, { override: { b: 'Website and shop' } }).pos.get('b').w;
  const badged = layout('M', sample(), measure, { badges: (n) => (n.id === 'b' ? 2 : 0) }).pos.get('b').w;
  expect(typed).toBeGreaterThan(plain);
  expect(badged).toBeGreaterThan(plain);
});

test('edgePath runs from the parent edge to the child edge', () => {
  const p = { x: 0, y: 0, w: 100, h: 20 };
  expect(edgePath(p, { x: 150, y: 40, w: 50, h: 20, side: 'right' })).toBe('M100,10 C125,10 125,50 150,50');
  expect(edgePath(p, { x: -100, y: 0, w: 50, h: 20, side: 'left' })).toBe('M0,10 C-25,10 -25,10 -50,10');
});

test('neighbour moves outwards, inwards and between siblings', () => {
  const { pos } = layout('M', sample(), measure);
  expect(neighbour(sample(), pos, ROOT, 'ArrowRight')).toBe('a');
  expect(neighbour(sample(), pos, ROOT, 'ArrowLeft')).toBe('b');
  expect(neighbour(sample(), pos, 'a', 'ArrowRight')).toBe('a1');
  expect(neighbour(sample(), pos, 'a1', 'ArrowLeft')).toBe('a');
  expect(neighbour(sample(), pos, 'a', 'ArrowLeft')).toBe(ROOT);
  expect(neighbour(sample(), pos, 'b', 'ArrowRight')).toBe(ROOT);
  expect(neighbour(sample(), pos, 'a1', 'ArrowDown')).toBe('a2');
  expect(neighbour(sample(), pos, 'b', 'ArrowDown')).toBe('c');
});

test('taskPlan builds the task tree and skips ideas that are tasks already', () => {
  const nodes = updateNode(updateNode(sample(), 'a2', { task_uid: 'u' }), 'a1', { note: 'A5' });
  expect(taskPlan(nodes, 'a', true)).toEqual({
    id: 'a', title: 'Marketing', description: null,
    children: [{ id: 'a1', title: 'Flyer', description: 'A5', children: [] }],
  });
  expect(taskPlan(nodes, 'a', false).children).toEqual([]);
  expect(subtreeIds(nodes, 'a').size).toBe(3);
  expect(childrenOf(nodes, ROOT).length).toBe(3);
});
