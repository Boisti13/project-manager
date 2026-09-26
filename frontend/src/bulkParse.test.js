// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { parseBulk, countNested } from './bulkParse';

const titles = (items) => items.map((i) => (i.children.length ? [i.title, titles(i.children)] : i.title));

test('one task per line, blank lines ignored', () => {
  const r = parseBulk('Buy cables\n\n  \nWrite guide\r\nCall supplier');
  assert.deepStrictEqual(titles(r.items), ['Buy cables', 'Write guide', 'Call supplier']);
  assert.strictEqual(r.count, 3);
});

test('indentation makes subtasks, at any depth', () => {
  const r = parseBulk(['Order parts', '  Antenna', '  Cables', '    Measure', 'Guide', '\tSection 1'].join('\n'));
  assert.deepStrictEqual(titles(r.items), [['Order parts', ['Antenna', ['Cables', ['Measure']]]], ['Guide', ['Section 1']]]);
  assert.strictEqual(r.count, 6);
  assert.strictEqual(countNested(r.items), 4);
});

test('uneven indentation still nests sensibly', () => {
  // 4 spaces, then 2: the 2-space line is still a child of the top line,
  // a sibling of nothing deeper than itself.
  const r = parseBulk('A\n    B\n  C\nD');
  assert.deepStrictEqual(titles(r.items), [['A', ['B', 'C']], 'D']);
  // first line indented is still top level
  assert.deepStrictEqual(titles(parseBulk('   X\nY').items), ['X', 'Y']);
});

test('bullets, numbering and Markdown checkboxes', () => {
  const r = parseBulk('- one\n* two\n• three\n+ four\n1. five\n2) six\n- [ ] open\n- [x] done\n[X] also done');
  assert.deepStrictEqual(titles(r.items), ['one', 'two', 'three', 'four', 'five', 'six', 'open', 'done', 'also done']);
  const byTitle = Object.fromEntries(r.items.map((i) => [i.title, i.status]));
  assert.strictEqual(byTitle.open, undefined);
  assert.strictEqual(byTitle.done, 'done');
  assert.strictEqual(byTitle['also done'], 'done');
});

test('lines that are only a marker are skipped; dashes inside titles stay', () => {
  const r = parseBulk('-\n- [ ]\nWi-Fi - check range\n2026-10-01 meeting');
  assert.deepStrictEqual(titles(r.items), ['Wi-Fi - check range', '2026-10-01 meeting']);
});

test('empty input', () => {
  assert.deepStrictEqual(parseBulk(''), { items: [], count: 0 });
  assert.deepStrictEqual(parseBulk(null), { items: [], count: 0 });
});
