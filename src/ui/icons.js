import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  Hourglass,
  LayoutDashboard,
  Minus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Trophy,
  TrendingUp,
  TriangleAlert,
  createElement,
} from 'lucide';

/**
 * Only the icons we actually use are imported, so the bundler can drop the rest
 * of the library. To add an icon: import it above and register it here.
 */
const ICONS = {
  activity: Activity,
  'arrow-down-right': ArrowDownRight,
  'arrow-up-right': ArrowUpRight,
  'calendar-days': CalendarDays,
  'chart-column': ChartColumn,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  clock: Clock,
  'external-link': ExternalLink,
  globe: Globe,
  hourglass: Hourglass,
  'layout-dashboard': LayoutDashboard,
  minus: Minus,
  'refresh-cw': RefreshCw,
  search: Search,
  settings: Settings,
  'shield-check': ShieldCheck,
  target: Target,
  trophy: Trophy,
  'trending-up': TrendingUp,
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
