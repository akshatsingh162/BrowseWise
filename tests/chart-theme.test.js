// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readChartTheme, withAlpha } from '../src/dashboard/charts/chart-theme.js';

describe('withAlpha', () => {
  it('converts a hex colour to rgba', () => {
    expect(withAlpha('#7c6cf0', 0.5)).toBe('rgba(124, 108, 240, 0.5)');
    expect(withAlpha('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
  });

  it('leaves anything that is not a 6-digit hex colour alone', () => {
    expect(withAlpha('rgb(1, 2, 3)', 0.5)).toBe('rgb(1, 2, 3)');
    expect(withAlpha('red', 0.5)).toBe('red');
  });
});

describe('readChartTheme', () => {
  it('falls back to the design values when tokens are not defined', () => {
    const theme = readChartTheme(document.createElement('div'));
    expect(theme.accent).toBe('#7c6cf0');
    expect(theme.chartMuted).toBe('#3b4150');
    expect(theme.accentDim).toBe('rgba(124, 108, 240, 0.55)');
    expect(theme.accentFill).toBe('rgba(124, 108, 240, 0.16)');
  });

  it('reads tokens from CSS custom properties when present', () => {
    const root = document.createElement('div');
    root.style.setProperty('--bw-accent', '#112233');
    document.body.append(root);
    expect(readChartTheme(root).accent).toBe('#112233');
    root.remove();
  });
});
