import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the stylesheets. They cannot say how the pages look, but they guard the
 * promises that are easy to break by accident: motion is always optional, dialogs are solid,
 * and no rule uses a design token that does not exist.
 */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const FILES = {
  tokens: 'src/ui/styles/tokens.css',
  base: 'src/ui/styles/base.css',
  components: 'src/ui/styles/components.css',
  ambient: 'src/ui/styles/ambient.css',
  dashboard: 'src/dashboard/styles/dashboard.css',
  popup: 'src/popup/popup.css',
};
const css = Object.fromEntries(Object.entries(FILES).map(([key, path]) => [key, read(path)]));

/** The text of every `@media` / `@supports` block, found by matching braces. */
function atRuleBlocks(source, header) {
  const blocks = [];
  let from = 0;
  for (;;) {
    const start = source.indexOf(header, from);
    if (start === -1) return blocks;
    const open = source.indexOf('{', start);
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(source.slice(open + 1, end));
    from = end;
  }
}

describe('motion is always optional', () => {
  const ambient = css.ambient;
  const gated = atRuleBlocks(ambient, '@media (prefers-reduced-motion: no-preference)').join('\n');
  // Everything outside the gated blocks.
  const ungated = atRuleBlocks(ambient, '@media (prefers-reduced-motion: no-preference)').reduce(
    (rest, block) => rest.replace(block, ''),
    ambient,
  );

  it('starts every animation inside a "no-preference" block', () => {
    const starters = /(^|[\s;{])animation(-name|-timeline)?\s*:/gm;
    // Keyframes and the reduced-motion reset are not animation starters.
    const outside = ungated.replace(/@keyframes[^{]+\{(?:[^{}]|\{[^{}]*\})*\}/g, '');
    expect(outside.match(starters) ?? []).toEqual([]);
    expect(gated.match(starters)?.length).toBeGreaterThanOrEqual(4);
  });

  it('guards scroll-driven animations with @supports, so older browsers show a still page', () => {
    expect(ambient).toContain('@supports (animation-timeline: scroll())');
    expect(ambient).toContain('@supports (animation-timeline: view())');
  });

  it('removes pointer offsets and transitions when reduced motion is requested', () => {
    const reduced = atRuleBlocks(ambient, '@media (prefers-reduced-motion: reduce)').join('\n');
    expect(reduced).toContain('translate: none');
    expect(reduced).toContain('transition: none');
  });

  it('hides the decoration when forced colours are on', () => {
    expect(atRuleBlocks(ambient, '@media (forced-colors: active)').join('\n')).toContain(
      'display: none',
    );
  });

  it('keeps the base reduced-motion rule', () => {
    expect(css.base).toContain('prefers-reduced-motion: reduce');
  });
});

describe('surfaces', () => {
  it('draws dialogs on a solid surface, so page text never shows through', () => {
    const modal = /\.db-modal \{[^}]*\}/.exec(css.dashboard)?.[0] ?? '';
    const background = /\n\s*background:([^;]*);/.exec(modal)?.[1] ?? '';
    // A glass gradient over a solid token: no translucent colour of its own.
    expect(background.trim()).toBe('var(--bw-glass), var(--bw-surface-raised)');
  });

  it('keeps the body transparent so the ambient background can show through it', () => {
    expect(/body \{[^}]*background:\s*transparent/s.test(css.base)).toBe(true);
  });

  it('uses the bundled font and no remote font or stylesheet', () => {
    expect(css.base).toContain("font-family: 'Plus Jakarta Sans'");
    expect(css.base).toContain('../fonts/plus-jakarta-sans-latin-wght-normal.woff2');
    for (const source of Object.values(css)) {
      // The SVG namespace inside an inline icon is a name, not a request.
      const withoutNamespace = source.replaceAll('http://www.w3.org/2000/svg', '');
      expect(withoutNamespace).not.toMatch(/@import|https?:\/\//);
    }
  });
});

describe('design tokens', () => {
  const defined = new Set();
  for (const source of Object.values(css)) {
    for (const match of source.matchAll(/(--bw-[a-z0-9-]+)\s*:/g)) defined.add(match[1]);
  }

  it('defines every --bw-* variable that any stylesheet uses', () => {
    const missing = new Set();
    for (const [file, source] of Object.entries(css)) {
      for (const match of source.matchAll(/var\((--bw-[a-z0-9-]+)/g)) {
        if (!defined.has(match[1])) missing.add(`${match[1]} (${file})`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('has no leftover indigo accent', () => {
    for (const [file, source] of Object.entries(css)) {
      expect(source, file).not.toMatch(/7c6cf0|6d5de6|5f4fdb|a79df7|124,\s*108,\s*240/i);
    }
  });

  it('keeps the accent a 6-digit hex, which the chart theme needs to add transparency', () => {
    expect(/--bw-chart-accent:\s*#[0-9a-f]{6};/i.test(css.tokens)).toBe(true);
    expect(/--bw-accent:\s*#[0-9a-f]{6};/i.test(css.tokens)).toBe(true);
  });
});
