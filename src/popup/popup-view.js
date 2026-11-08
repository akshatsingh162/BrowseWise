import { faviconUrl } from '../shared/favicon.js';
import { describeComparison, formatDuration, formatPercent } from '../shared/format.js';
import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

/**
 * Popup rendering. Pure DOM construction: given a state, build the screen.
 * All behaviour lives in popup-controller.js.
 *
 * state: { status: 'loading' }
 *      | { status: 'error', message }
 *      | { status: 'ready', overview }   (see buildOverview in shared/stats.js)
 */

const TOP_SITES_SHOWN = 5;
const COMPARISON_ICONS = {
  up: 'arrow-up-right',
  down: 'arrow-down-right',
  flat: 'minus',
  none: 'minus',
};

function renderHeader({ onOpenDashboard }) {
  return el('header', { class: 'pp-header' }, [
    el('div', { class: 'pp-brand' }, [
      el('img', {
        class: 'pp-logo',
        src: chrome.runtime.getURL('icons/icon-32.png'),
        alt: '',
        width: 20,
        height: 20,
      }),
      el('span', { class: 'pp-brand-name', text: 'BrowseWise' }),
    ]),
    el(
      'button',
      {
        type: 'button',
        class: 'bw-icon-btn',
        'aria-label': 'Open dashboard',
        title: 'Open dashboard',
        onClick: onOpenDashboard,
      },
      [icon('external-link')],
    ),
  ]);
}

function renderFooter({ onOpenDashboard }) {
  return el('footer', { class: 'pp-footer' }, [
    el(
      'button',
      { type: 'button', class: 'bw-btn bw-btn-primary bw-btn-block', onClick: onOpenDashboard },
      [el('span', { text: 'Open dashboard' }), icon('external-link', { size: 14 })],
    ),
    el('p', {
      class: 'pp-footnote',
      text: 'Active browsing time. Stored only on this device.',
    }),
  ]);
}

function renderFavicon(domain) {
  const img = el('img', {
    class: 'pp-favicon',
    src: faviconUrl(domain, 32),
    alt: '',
    width: 16,
    height: 16,
    loading: 'lazy',
  });
  // If Chrome has no icon for the site, fall back to a neutral globe.
  img.addEventListener('error', () => img.replaceWith(icon('globe', { size: 16 })), { once: true });
  return img;
}

function renderHero(overview) {
  const comparison = describeComparison(overview.comparison);

  const stats = [
    el('div', { class: 'pp-stat' }, [
      el('span', { class: 'pp-stat-label', text: 'Websites' }),
      el('span', { class: 'pp-stat-value bw-num', text: String(overview.siteCount) }),
    ]),
    el('div', { class: 'pp-stat pp-stat-wide' }, [
      el('span', { class: 'pp-stat-label', text: 'Most used' }),
      el('span', { class: 'pp-stat-value pp-truncate', text: overview.topSite.domain }),
    ]),
  ];

  return el('section', { class: 'bw-card pp-hero', 'aria-label': 'Today' }, [
    el('div', { class: 'pp-hero-top' }, [
      el('span', { class: 'pp-eyebrow', text: 'Today' }),
      el(
        'span',
        { class: `bw-chip pp-delta pp-delta-${comparison.direction}`, title: comparison.tooltip },
        [icon(COMPARISON_ICONS[comparison.direction], { size: 12 }), comparison.label],
      ),
    ]),
    el('p', { class: 'pp-total bw-num', text: formatDuration(overview.totalMs) }),
    el('div', { class: 'pp-stats' }, stats),
  ]);
}

function renderSiteRow(site) {
  const percent = formatPercent(site.share);
  return el('li', { class: 'pp-site' }, [
    renderFavicon(site.domain),
    el('span', { class: 'pp-site-name pp-truncate', text: site.domain, title: site.domain }),
    el('span', { class: 'pp-site-time bw-num' }, [
      formatDuration(site.ms),
      el('span', { class: 'pp-site-pct', text: percent }),
    ]),
    el('div', { class: 'bw-bar pp-site-bar', title: `${percent} of today` }, [
      el('div', { class: 'bw-bar-fill', style: `width: ${Math.max(site.share * 100, 0)}%` }),
    ]),
  ]);
}

function renderTopSites(overview) {
  const sites = overview.ranked.slice(0, TOP_SITES_SHOWN);
  const hidden = overview.ranked.length - sites.length;

  return el('section', { class: 'pp-section', 'aria-label': 'Top websites' }, [
    el('h2', { class: 'pp-section-title', text: 'Top websites' }),
    el('ul', { class: 'pp-sites' }, sites.map(renderSiteRow)),
    hidden > 0 && el('p', { class: 'pp-more', text: `+${hidden} more in the dashboard` }),
  ]);
}

function renderSkeleton() {
  const rows = [0, 1, 2].map(() =>
    el('div', { class: 'pp-skeleton-row' }, [
      el('div', { class: 'bw-skeleton', style: 'width: 16px; height: 16px' }),
      el('div', { class: 'bw-skeleton', style: 'height: 12px; flex: 1' }),
      el('div', { class: 'bw-skeleton', style: 'width: 44px; height: 12px' }),
    ]),
  );

  return el('div', { class: 'pp-body', role: 'status', 'aria-label': 'Loading today’s usage' }, [
    el('div', { class: 'bw-card pp-hero' }, [
      el('div', { class: 'bw-skeleton', style: 'width: 60px; height: 12px' }),
      el('div', { class: 'bw-skeleton', style: 'width: 140px; height: 34px; margin-top: 12px' }),
      el('div', { class: 'bw-skeleton', style: 'width: 100%; height: 28px; margin-top: 16px' }),
    ]),
    el('div', { class: 'pp-section' }, rows),
  ]);
}

function renderEmpty() {
  return el('div', { class: 'pp-body' }, [
    el('div', { class: 'bw-card bw-state' }, [
      el('div', { class: 'bw-state-icon' }, [icon('hourglass', { size: 20 })]),
      el('h2', { class: 'bw-state-title', text: 'No browsing time yet today' }),
      el('p', {
        class: 'bw-state-text',
        text: 'Open a website and BrowseWise starts counting while you are active.',
      }),
    ]),
  ]);
}

function renderError(message, { onRetry }) {
  return el('div', { class: 'pp-body' }, [
    el('div', { class: 'bw-card bw-state', role: 'alert' }, [
      el('div', { class: 'bw-state-icon bw-state-icon-danger' }, [
        icon('triangle-alert', { size: 20 }),
      ]),
      el('h2', { class: 'bw-state-title', text: 'Something went wrong' }),
      el('p', { class: 'bw-state-text', text: message }),
      el('button', { type: 'button', class: 'bw-btn bw-btn-secondary', onClick: onRetry }, [
        icon('refresh-cw', { size: 14 }),
        el('span', { text: 'Try again' }),
      ]),
    ]),
  ]);
}

/**
 * Replaces the contents of `root` with the screen for `state`.
 * @param {HTMLElement} root
 * @param {object} state
 * @param {{onRetry: () => void, onOpenDashboard: () => void}} handlers
 */
export function renderPopup(root, state, handlers) {
  let body;
  if (state.status === 'loading') {
    body = renderSkeleton();
  } else if (state.status === 'error') {
    body = renderError(state.message, handlers);
  } else if (state.overview.totalMs <= 0) {
    body = renderEmpty();
  } else {
    body = el('div', { class: 'pp-body' }, [
      renderHero(state.overview),
      renderTopSites(state.overview),
    ]);
  }

  root.replaceChildren(renderHeader(handlers), body, renderFooter(handlers));
}
