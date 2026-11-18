/**
 * Chart.js cannot read CSS variables, so the design tokens are resolved to real
 * colour values once and passed into the chart configs.
 */

const FALLBACK = {
  accent: '#d6d6de',
  chartMuted: '#3a3a43',
  text: '#f3f3f6',
  textMuted: '#b0b0ba',
  grid: '#1c1c21',
  tooltipBackground: '#18181c',
  tooltipBorder: '#2a2a31',
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
};

/** "#d6d6de" + 0.55 -> "rgba(214, 214, 222, 0.55)". Non-hex input is returned unchanged. */
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

  // The chart series colour: its own token, so charts can be softer than buttons.
  const accent = read('--bw-chart-accent', FALLBACK.accent);
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
