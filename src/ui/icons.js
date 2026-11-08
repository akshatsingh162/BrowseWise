import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Globe,
  Hourglass,
  Minus,
  RefreshCw,
  TriangleAlert,
  createElement,
} from 'lucide';

/**
 * Only the icons we actually use are imported, so the bundler can drop the rest
 * of the library. To add an icon: import it above and register it here.
 */
const ICONS = {
  'arrow-down-right': ArrowDownRight,
  'arrow-up-right': ArrowUpRight,
  'external-link': ExternalLink,
  globe: Globe,
  hourglass: Hourglass,
  minus: Minus,
  'refresh-cw': RefreshCw,
  'triangle-alert': TriangleAlert,
};

/**
 * @param {keyof typeof ICONS} name
 * @param {{size?: number}} [options]
 * @returns {SVGElement}
 */
export function icon(name, { size = 16 } = {}) {
  const definition = ICONS[name];
  if (!definition) throw new Error(`Unknown icon: ${name}`);

  return createElement(definition, {
    width: size,
    height: size,
    'stroke-width': 1.75,
    class: 'bw-icon',
    'aria-hidden': 'true',
  });
}
