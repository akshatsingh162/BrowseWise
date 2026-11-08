import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { readChartTheme } from './chart-theme.js';

/**
 * The only file that touches Chart.js. Only the pieces we use are registered, so
 * the bundler can drop the rest of the library.
 */
Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
);

let defaultsApplied = false;

function applyDefaults() {
  if (defaultsApplied) return;
  const theme = readChartTheme();
  Chart.defaults.font.family = theme.fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = theme.textMuted;
  defaultsApplied = true;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} config a Chart.js config from chart-configs.js
 * @returns {import('chart.js').Chart}
 */
export function createChart(canvas, config) {
  applyDefaults();

  // Respect the operating-system "reduce motion" setting.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    config.options.animation = false;
  }
  return new Chart(canvas, config);
}
