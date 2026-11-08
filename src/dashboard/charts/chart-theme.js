/**
 * Chart.js cannot read CSS variables, so the design tokens are resolved to real
 * colour values once and passed into the chart configs.
 */

const FALLBACK = {
  accent: '#7c6cf0',
  chartMuted: '#3b4150',
  text: '#e8eaee',
  textMuted: '#9aa1ad',
  grid: '#1f2329',
  tooltipBackground: '#1b1e24',
  tooltipBorder: '#262a31',
  fontFamily: "'Inter', system-ui, sans-serif",
};

/** "#7c6cf0" + 0.55 -> "rgba(124, 108, 240, 0.55)". Non-hex input is returned unchanged. */
export function withAlpha(color, alpha) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

/**
 * @param {Element} [root] element whose computed style holds the tokens
 */
export function readChartTheme(root = document.documentElement) {
  const style = getComputedStyle(root);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;

  const accent = read('--bw-accent', FALLBACK.accent);
  return {
    accent,
    accentDim: withAlpha(accent, 0.55),
    accentFill: withAlpha(accent, 0.16),
    chartMuted: read('--bw-chart-muted', FALLBACK.chartMuted),
    text: read('--bw-text', FALLBACK.text),
    textMuted: read('--bw-text-muted', FALLBACK.textMuted),
    grid: read('--bw-border-subtle', FALLBACK.grid),
    tooltipBackground: read('--bw-surface-raised', FALLBACK.tooltipBackground),
    tooltipBorder: read('--bw-border', FALLBACK.tooltipBorder),
    fontFamily: read('--bw-font', FALLBACK.fontFamily),
  };
}
