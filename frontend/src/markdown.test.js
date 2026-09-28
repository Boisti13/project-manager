// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderMarkdown } from './markdown';

const html = (text, opts) => renderToStaticMarkup(<div>{renderMarkdown(text, opts)}</div>).slice(5, -6);

test('inline formatting', () => {
  assert.strictEqual(html('**40** units, *soon*, ~~old~~ and `pm2 restart`'),
    '<p><strong>40</strong> units, <em>soon</em>, <del>old</del> and <code>pm2 restart</code></p>');
  assert.strictEqual(html('snake_case_name stays, _this_ is italic'), '<p>snake_case_name stays, <em>this</em> is italic</p>');
  assert.strictEqual(html('2 * 3 * 4'), '<p>2 * 3 * 4</p>'); // not italic
  assert.strictEqual(html('`**not bold**`'), '<p><code>**not bold**</code></p>');
});

test('links: only http(s) and mailto, bare ones too, trailing punctuation left out', () => {
  const a = (url, text) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  assert.strictEqual(html('[Quote](https://example.com/q?id=1)'), `<p>${a('https://example.com/q?id=1', 'Quote')}</p>`);
  assert.strictEqual(html('See https://example.com/a_b.'), `<p>See ${a('https://example.com/a_b', 'https://example.com/a_b')}.</p>`);
  assert.strictEqual(html('(http://x.org/y)'), `<p>(${a('http://x.org/y', 'http://x.org/y')})</p>`);
  assert.strictEqual(html('[mail](mailto:a@b.de)'), `<p>${a('mailto:a@b.de', 'mail')}</p>`);
  assert.strictEqual(html('[click](javascript:alert(1))'), '<p>[click](javascript:alert(1))</p>');
  assert.strictEqual(html('<b>not html</b>'), '<p>&lt;b&gt;not html&lt;/b&gt;</p>');
});

test('blocks: paragraphs, line breaks, lists, checklists, headings, quotes, code', () => {
  assert.strictEqual(html('one\ntwo\n\nthree'), '<p>one<br/>two</p><p>three</p>');
  assert.strictEqual(html('Steps:\n- cables\n- **antennas**\n\n1. order\n2) check'),
    '<p>Steps:</p><ul><li>cables</li><li><strong>antennas</strong></li></ul><ol><li>order</li><li>check</li></ol>');
  assert.strictEqual(html('- [x] quote\n- [ ] order'),
    '<ul><li class="md-check done"><span class="md-box" aria-label="☑">☑</span> quote</li>' +
      '<li class="md-check "><span class="md-box" aria-label="☐">☐</span> order</li></ul>');
  assert.strictEqual(html('## Setup\n> note\n> more'), '<p class="md-heading">Setup</p><blockquote>note<br/>more</blockquote>');
  assert.strictEqual(html('```\nif a < b:\n    **x**\n```'), '<pre><code>if a &lt; b:\n    **x**</code></pre>');
});

test('@mentions are marked, e-mail addresses are not', () => {
  assert.strictEqual(html('@anna, see a@b.de and @max.b.'),
    '<p><span class="md-mention">@anna</span>, see a@b.de and <span class="md-mention">@max.b</span>.</p>');
});

test('text goes through renderText (search highlighting)', () => {
  const renderText = (s, key) => <mark key={key}>{s}</mark>;
  assert.strictEqual(html('**big** deal', { renderText }), '<p><strong><mark>big</mark></strong><mark> deal</mark></p>');
});
