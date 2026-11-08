import { el } from '../../ui/dom.js';

function buildTable(caption, { columns, rows }) {
  return el('table', { class: 'bw-sr-only' }, [
    el('caption', { text: caption }),
    el('thead', {}, [
      el(
        'tr',
        {},
        columns.map((column) => el('th', { scope: 'col', text: column })),
      ),
    ]),
    el(
      'tbody',
      {},
      rows.map((row) =>
        el(
          'tr',
          {},
          row.map((cell) => el('td', { text: cell })),
        ),
      ),
    ),
  ]);
}

/**
 * A card holding one chart.
 *
 * The chart is created in `mount()`, which the caller runs AFTER the card is in the
 * page (a chart needs real dimensions), and removed in `destroy()`. The canvas is
 * marked as an image, and the same numbers are provided as a visually hidden table
 * so screen-reader users are not left with an unreadable picture.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {{config: object, table: {columns: string[], rows: string[][]}}} options.spec
 *        from chart-configs.js
 * @param {(canvas: HTMLCanvasElement, config: object) => {destroy: () => void}} options.createChart
 * @param {number} [options.height] chart height in px
 */
export function chartCard({ title, description, spec, createChart, height = 260 }) {
  const canvas = el('canvas', { role: 'img', 'aria-label': `${title}. ${description}` });
  const plot = el('div', { class: 'db-chart-canvas', style: `height: ${height}px` }, [canvas]);

  const element = el('section', { class: 'bw-card db-chart', 'aria-label': title }, [
    el('div', { class: 'db-chart-head' }, [
      el('h2', { class: 'db-panel-title', text: title }),
      el('p', { class: 'db-chart-desc', text: description }),
    ]),
    plot,
    buildTable(title, spec.table),
  ]);

  let chart = null;
  return {
    element,

    mount() {
      try {
        chart = createChart(canvas, spec.config);
      } catch (error) {
        // The hidden table still carries the data, so a failed chart is not fatal.
        console.error('[BrowseWise] could not draw chart', error);
        plot.replaceChildren(
          el('p', {
            class: 'db-chart-error',
            role: 'alert',
            text: 'This chart could not be drawn.',
          }),
        );
      }
    },

    destroy() {
      chart?.destroy();
      chart = null;
    },
  };
}
