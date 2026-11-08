import { faviconUrl } from '../shared/favicon.js';
import { icon } from './icons.js';

/**
 * A website's favicon as an <img>, rendered at 2x for sharpness. If Chrome has no
 * icon for the site, the image is swapped for a neutral globe.
 *
 * @param {string} domain
 * @param {{size?: number, className?: string}} [options] size is the displayed size in px
 * @returns {HTMLImageElement}
 */
export function createFavicon(domain, { size = 16, className = 'bw-favicon' } = {}) {
  const img = document.createElement('img');
  img.className = className;
  img.src = faviconUrl(domain, size * 2);
  img.alt = '';
  img.width = size;
  img.height = size;
  img.loading = 'lazy';

  img.addEventListener(
    'error',
    () => {
      const fallback = icon('globe', { size });
      fallback.classList.add('bw-favicon-fallback');
      img.replaceWith(fallback);
    },
    { once: true },
  );
  return img;
}
