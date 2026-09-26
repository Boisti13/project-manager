// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import de from './locales/de';
import { t, tn, setLanguage, detectLanguage } from './i18n';

// Every t('…') / tn(n, '…', '…') key in the source, as written.
function usedKeys() {
  const keys = new Map(); // key -> file
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) {
        if (name !== 'locales') walk(p);
      } else if (/\.js$/.test(name) && !/\.test\.js$/.test(name) && name !== 'i18n.js') {
        files.push(p);
      }
    }
  };
  walk(__dirname);
  const lit = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;
  const unescape = (s) => s.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c));
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!/\bt\(\s*`/.test(src), `${file}: t() with a template literal can't be translated`);
    for (const m of src.matchAll(new RegExp(String.raw`\bt\(\s*(?:${lit})`, 'g'))) {
      keys.set(unescape(m[1] ?? m[2]), file);
    }
    for (const m of src.matchAll(/\btn\(/g)) {
      const rest = src.slice(m.index, m.index + 400);
      const strings = [...rest.matchAll(new RegExp(lit, 'g'))].slice(0, 2);
      strings.forEach((s) => keys.set(unescape(s[1] ?? s[2]), file));
    }
  }
  return keys;
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('every UI text has a German translation with the same placeholders', () => {
  const keys = usedKeys();
  assert.ok(keys.size > 100, `only found ${keys.size} keys`);
  const missing = [...keys.keys()].filter((k) => de[k] === undefined);
  assert.deepStrictEqual(missing, [], `missing in locales/de.js:\n${missing.join('\n')}`);
  const mismatched = [...keys.keys()].filter((k) => placeholders(k) !== placeholders(de[k]));
  assert.deepStrictEqual(mismatched, [], `placeholders differ:\n${mismatched.join('\n')}`);
});

test('t, tn and language detection', () => {
  setLanguage('de');
  assert.strictEqual(t('Save'), 'Speichern');
  assert.strictEqual(t('Due {date}', { date: '29. Sept.' }), 'Fällig 29. Sept.');
  assert.strictEqual(t('No such key {x}', { x: 1 }), 'No such key 1'); // falls back to English
  assert.strictEqual(tn(1, 'one new notification', '{n} new notifications'), 'eine neue Benachrichtigung');
  assert.strictEqual(tn(3, 'one new notification', '{n} new notifications'), '3 neue Benachrichtigungen');
  setLanguage('en');
  assert.strictEqual(t('Save'), 'Save');
  assert.strictEqual(detectLanguage('de'), 'de');
  assert.strictEqual(detectLanguage('xx') === 'de' || detectLanguage('xx') === 'en', true);
});
