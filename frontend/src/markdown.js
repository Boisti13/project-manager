// A small Markdown subset for task descriptions and comments, turned into
// React elements (never HTML strings, so nothing typed can inject markup):
//
//   **bold**  *italic*  _italic_  ~~struck~~  `code`
//   [text](https://…)  and bare https://… links (http, https, mailto only)
//   - lists / * lists / 1. numbered lists, "- [ ]" and "- [x]" checklists
//   # headings, > quotes, ``` code blocks ```, @mentions
//
// Single line breaks stay line breaks. renderText(text, key) draws plain
// text (e.g. with search highlighting); onLink(event, url) can take over
// link clicks (the Windows app opens them in the browser).
import React from 'react';

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

// One regex for all inline elements; the first match wins, text in between stays text.
const INLINE = new RegExp(
  [
    '(`[^`\\n]+`)', // 1 code
    '\\[([^\\]\\n]+)\\]\\(([^)\\s]+)\\)', // 2, 3 link
    '\\*\\*([^\\n]+?)\\*\\*', // 4 bold
    '__([^\\n]+?)__', // 5 bold
    '~~([^\\n]+?)~~', // 6 strike
    '\\*([^*\\s](?:[^*\\n]*[^*\\s])?)\\*', // 7 italic
    '(?<![\\w])_([^_\\s](?:[^_\\n]*[^_\\s])?)_(?![\\w])', // 8 italic, not inside snake_case
    '((?:https?:\\/\\/|mailto:)[^\\s<>]*[^\\s<>.,;:!?\'")\\]])', // 9 bare link
    '(?<![\\w@/])@([\\w.\\-]*\\w)', // 10 @mention (not in e-mail addresses)
  ].join('|'),
  'g'
);

function inline(text, ctx, keyBase) {
  const out = [];
  let last = 0;
  let n = 0;
  const key = () => `${keyBase}.${n++}`;
  const plain = (s) => {
    if (s) out.push(ctx.renderText(s, key()));
  };
  // Its own copy: bold/italic/link text is parsed by a nested call, which
  // must not move this loop's position.
  const re = new RegExp(INLINE.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    plain(text.slice(last, m.index));
    last = m.index + m[0].length;
    const k = key();
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(link(m[3], inline(m[2], ctx, k), ctx, k, m[0]));
    else if (m[4] || m[5]) out.push(<strong key={k}>{inline(m[4] || m[5], ctx, k)}</strong>);
    else if (m[6]) out.push(<del key={k}>{inline(m[6], ctx, k)}</del>);
    else if (m[7] || m[8]) out.push(<em key={k}>{inline(m[7] || m[8], ctx, k)}</em>);
    else if (m[9]) out.push(link(m[9], ctx.renderText(m[9], `${k}.t`), ctx, k, m[9]));
    else if (m[10]) out.push(<span key={k} className="md-mention">{ctx.renderText(`@${m[10]}`, `${k}.t`)}</span>);
  }
  plain(text.slice(last));
  return out;
}

function link(url, children, ctx, key, original) {
  if (!SAFE_URL.test(url)) return ctx.renderText(original, key); // e.g. javascript: — shown as typed
  return (
    <a key={key} href={url} target="_blank" rel="noopener noreferrer" onClick={ctx.onLink ? (e) => ctx.onLink(e, url) : undefined}>
      {children}
    </a>
  );
}

// Lines of a paragraph, with their line breaks.
function lines(list, ctx, keyBase) {
  const out = [];
  list.forEach((l, i) => {
    if (i) out.push(<br key={`${keyBase}.br${i}`} />);
    out.push(...inline(l, ctx, `${keyBase}.${i}`));
  });
  return out;
}

const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const CHECK = /^\[([ xX])\]\s+(.*)$/;

/** Parses `source` into blocks of React elements. */
export function renderMarkdown(source, { renderText = (s) => s, onLink = null } = {}) {
  const ctx = { renderText, onLink };
  const src = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  const k = () => `b${blocks.length}`;
  while (i < src.length) {
    const line = src[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (/^\s*```/.test(line)) {
      const code = [];
      i += 1;
      while (i < src.length && !/^\s*```/.test(src[i])) code.push(src[i++]);
      i += 1; // the closing fence (or the end)
      blocks.push(
        <pre key={k()}>
          <code>{code.join('\n')}</code>
        </pre>
      );
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(<p key={k()} className="md-heading">{inline(heading[2], ctx, k())}</p>);
      i += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote = [];
      while (i < src.length && /^\s*>/.test(src[i])) quote.push(src[i++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={k()}>{lines(quote, ctx, k())}</blockquote>);
      continue;
    }
    const first = LIST_ITEM.exec(line);
    if (first) {
      const ordered = !first[1];
      const items = [];
      while (i < src.length) {
        const item = LIST_ITEM.exec(src[i]);
        if (!item || !item[1] !== ordered) break;
        items.push(item[3]);
        i += 1;
      }
      const key = k();
      const lis = items.map((text, j) => {
        const check = CHECK.exec(text);
        if (check) {
          const done = check[1] !== ' ';
          return (
            <li key={j} className={`md-check ${done ? 'done' : ''}`}>
              <span className="md-box" aria-label={done ? '☑' : '☐'}>{done ? '☑' : '☐'}</span> {inline(check[2], ctx, `${key}.${j}`)}
            </li>
          );
        }
        return <li key={j}>{inline(text, ctx, `${key}.${j}`)}</li>;
      });
      blocks.push(ordered ? <ol key={key}>{lis}</ol> : <ul key={key}>{lis}</ul>);
      continue;
    }
    // A paragraph: up to a blank line or the start of another block.
    const para = [];
    while (
      i < src.length &&
      src[i].trim() &&
      !/^\s*```/.test(src[i]) &&
      !/^#{1,6}\s/.test(src[i]) &&
      !/^\s*>/.test(src[i]) &&
      !LIST_ITEM.test(src[i])
    ) {
      para.push(src[i++]);
    }
    blocks.push(<p key={k()}>{lines(para, ctx, k())}</p>);
  }
  return blocks;
}
