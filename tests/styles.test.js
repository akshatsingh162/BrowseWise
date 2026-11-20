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

describe('navigation dock', () => {
  const rule = (selector) =>
    new RegExp(`${selector.replace(/[.]/g, '\\.')} \\{[^}]*\\}`).exec(css.dashboard)?.[0] ?? '';

  it('has no bar: the wrapper and the row draw nothing, only the buttons do', () => {
    for (const selector of ['.dk-wrap', '.dk']) {
      const block = rule(selector);
      expect(block, selector).not.toBe('');
      expect(block, selector).not.toMatch(/background|border|box-shadow|backdrop-filter/);
    }
  });

  it('lets clicks through the wrapper and the row, and only the buttons take them', () => {
    expect(rule('.dk-wrap')).toContain('pointer-events: none');
    expect(rule('.dk')).toContain('pointer-events: none');
    expect(rule('.dk-item')).toContain('pointer-events: auto');
  });

  it('is fixed to the window, so the page keeps the whole width', () => {
    expect(rule('.dk-wrap')).toContain('position: fixed');
    expect(css.dashboard).not.toMatch(/\.db-sidebar|grid-template-columns:\s*\d+px\s+1fr/);
  });

  it('gives each button a blurred, mostly opaque backing, so text under it never competes with its icon', () => {
    const block = rule('.dk-item');
    expect(block).toContain('backdrop-filter');
    const alpha = Number(
      /background:\s*rgba\(\s*\d+,\s*\d+,\s*\d+,\s*([\d.]+)\s*\)/.exec(block)?.[1],
    );
    expect(alpha).toBeGreaterThanOrEqual(0.65);
  });

  it('does not let its entrance animation keep holding a value (that stopped the blur working)', () => {
    // Comments explain the rule and may use these very words, so they are not part of the check.
    const withoutComments = css.ambient.replace(/\/\*[\s\S]*?\*\//g, '');
    const entrance = /\.dk-wrap \{[^}]*animation:[^;]*;/.exec(withoutComments)?.[0] ?? '';
    expect(entrance).toContain('bw-dock-in');
    expect(entrance).toMatch(/backwards\s*;/);
    expect(entrance).not.toMatch(/\bboth\b|forwards/);
  });

  it('keeps the dock reachable with the keyboard when it is hidden', () => {
    const hiddenRule = /\.dk\[data-hidden='true'\] \{[^}]*\}/.exec(css.dashboard)?.[0] ?? '';
    expect(hiddenRule).not.toMatch(/display:\s*none|visibility:\s*hidden/);
  });

  it('shows a clear focus ring on every dock and corner button', () => {
    expect(css.dashboard).toMatch(/\.dk-item:focus-visible \{[^}]*outline: 2px solid/);
    expect(css.dashboard).toMatch(/\.dk-corner:focus-visible \{[^}]*outline: 2px solid/);
  });
});
