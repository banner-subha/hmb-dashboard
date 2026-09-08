import { Fragment, useMemo } from 'react';

// A small markdown renderer covering what the agent actually emits: headings,
// bold/italic/code, links, lists, blockquotes, fenced code and GFM tables.
// Everything becomes React elements, so no HTML is ever injected.
//
// Sized for a 420px column rather than a full page: type a notch smaller, and
// every wide block (code, tables) scrolls inside its own box so the panel
// itself never scrolls sideways.

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)\s]+\))/g;

function renderInline(text, keyPrefix = 'i') {
  const parts = String(text).split(INLINE).filter((s) => s !== '' && s !== undefined);
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) {
      return (
        <strong key={key} className="font-semibold text-text-primary">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code
          key={key}
          className="rounded bg-bg-input px-1.5 py-0.5 text-[0.9em] font-mono text-accent-sky"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (/^\*[^*\n]+\*$/.test(part) || /^_[^_\n]+_$/.test(part)) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const href = link[2];
      const safe = /^(https?:|mailto:)/i.test(href);
      if (!safe) return <Fragment key={key}>{link[1]}</Fragment>;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-blue underline decoration-accent-blue/40 hover:decoration-accent-blue"
        >
          {link[1]}
        </a>
      );
    }
    return <Fragment key={key}>{part}</Fragment>;
  });
}

function splitRow(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

const isDivider = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

// Numeric-looking cells right-align, which is most of what this app reports.
const isNumeric = (v) => /^[₹$Rs.\s]*-?[\d,]+(\.\d+)?\s*(%|t|MT|\/t|Cr|L)?$/i.test(String(v).trim());

function parseBlocks(src) {
  const lines = String(src).replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    // fenced code
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', lang: fence[1], text: body.join('\n') });
      continue;
    }

    // heading
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    // table: a pipe row followed by a divider row
    if (line.trim().startsWith('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    // list
    const bullet = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (bullet) {
      const ordered = /\d/.test(bullet[1]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
        if (!m) break;
        items.push(m[2]);
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    // blockquote
    if (/^\s*>\s?/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', text: body.join(' ') });
      continue;
    }

    // paragraph, to the next blank line
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,4}\s|[-*+]\s|\d+\.\s|>|```)/.test(lines[i])) {
      if (lines[i].trim().startsWith('|')) break;
      para.push(lines[i].trim());
      i += 1;
    }
    if (para.length) blocks.push({ type: 'para', text: para.join(' ') });
    else i += 1;
  }

  return blocks;
}

const HEADING_CLASS = {
  1: 'text-[1.15rem] font-semibold text-text-primary mt-5 mb-2',
  2: 'text-[1.05rem] font-semibold text-text-primary mt-5 mb-2',
  3: 'text-[0.95rem] font-semibold text-text-primary mt-4 mb-1.5',
  4: 'text-[0.9rem] font-semibold text-text-secondary mt-3 mb-1',
};

export default function Markdown({ text }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <div className="text-[0.9rem] leading-[1.65] text-text-secondary">
      {blocks.map((b, bi) => {
        const key = `b-${bi}`;
        if (b.type === 'heading') {
          const Tag = `h${Math.min(b.level + 1, 6)}`;
          return (
            <Tag key={key} className={HEADING_CLASS[b.level] || HEADING_CLASS[4]}>
              {renderInline(b.text, key)}
            </Tag>
          );
        }
        if (b.type === 'para') {
          return (
            <p key={key} className="my-2.5 first:mt-0 last:mb-0">
              {renderInline(b.text, key)}
            </p>
          );
        }
        if (b.type === 'list') {
          const Tag = b.ordered ? 'ol' : 'ul';
          return (
            <Tag
              key={key}
              className={`my-2.5 space-y-1 pl-5 ${b.ordered ? 'list-decimal' : 'list-disc'} marker:text-text-dim`}
            >
              {b.items.map((it, ii) => (
                <li key={`${key}-${ii}`}>{renderInline(it, `${key}-${ii}`)}</li>
              ))}
            </Tag>
          );
        }
        if (b.type === 'quote') {
          return (
            <blockquote
              key={key}
              className="my-3 border-l-2 border-border-accent pl-3.5 text-text-muted"
            >
              {renderInline(b.text, key)}
            </blockquote>
          );
        }
        if (b.type === 'code') {
          return (
            <pre
              key={key}
              className="my-3 overflow-x-auto rounded-xl border border-border bg-bg-input p-3.5 text-[0.85rem] leading-relaxed"
            >
              <code className="font-mono text-text-secondary">{b.text}</code>
            </pre>
          );
        }
        if (b.type === 'table') {
          return (
            <div key={key} className="my-3.5 overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse text-[0.875rem]">
                <thead>
                  <tr className="bg-bg-tertiary">
                    {b.header.map((h, hi) => (
                      <th
                        key={`${key}-h-${hi}`}
                        className={`whitespace-nowrap px-3 py-2 font-semibold text-text-primary ${
                          hi === 0 ? 'text-left' : 'text-right'
                        }`}
                      >
                        {renderInline(h, `${key}-h-${hi}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, ri) => (
                    <tr key={`${key}-r-${ri}`} className="border-t border-border">
                      {r.map((c, ci) => (
                        <td
                          key={`${key}-r-${ri}-${ci}`}
                          className={`px-3 py-2 ${
                            ci === 0
                              ? 'text-left text-text-primary'
                              : isNumeric(c)
                                ? 'text-right font-medium tabular-nums'
                                : 'text-right'
                          }`}
                        >
                          {renderInline(c, `${key}-r-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
