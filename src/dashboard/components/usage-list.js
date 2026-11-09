import { formatDuration, formatPercent } from '../../shared/format.js';
import { el } from '../../ui/dom.js';
import { createFavicon } from '../../ui/favicon-image.js';

/**
 * Ranked website rows: favicon, name, share bar, time, and percentage.
 *
 * @param {{domain: string, ms: number, share: number, rank?: number}[]} sites
 * @param {object} [options]
 * @param {boolean} [options.showRank]
 * @param {(site: object) => Node} [options.categoryCell] adds a category column
 */
export function usageList(sites, { showRank = false, categoryCell } = {}) {
  const rows = sites.map((site, index) => {
    const percent = formatPercent(site.share);
    return el('li', { class: 'db-usage-row' }, [
      showRank && el('span', { class: 'db-rank bw-num', text: String(site.rank ?? index + 1) }),
      el('span', { class: 'db-site' }, [
        createFavicon(site.domain, { size: 16 }),
        el('span', { class: 'db-site-name', text: site.domain, title: site.domain }),
      ]),
      categoryCell && categoryCell(site),
      el('div', { class: 'bw-bar', title: `${percent} of the total` }, [
        el('div', { class: 'bw-bar-fill', style: `width: ${Math.max(site.share * 100, 0)}%` }),
      ]),
      el('span', { class: 'db-time bw-num', text: formatDuration(site.ms) }),
      el('span', { class: 'db-pct bw-num', text: percent }),
    ]);
  });

  return el(
    'ol',
    {
      class: `db-usage${showRank ? ' db-usage-ranked' : ''}${categoryCell ? ' db-usage-categorized' : ''}`,
    },
    rows,
  );
}
