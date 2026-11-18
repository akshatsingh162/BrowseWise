import { dayShort } from '../../shared/labels.js';
import { el } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';

const TIER_LABELS = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

/**
 * One badge: a medallion, its name, what earns it, and either the day it was earned or how
 * close the user is. Locked badges are grey with a lock, and say "Locked" in words, so state
 * and tier never depend on colour alone.
 *
 * @param {object} options
 * @param {{id: string, title: string, description: string, icon: string, tier: string, unit: string}} options.badge
 * @param {string|null} options.earnedOn YYYY-MM-DD, or null while locked
 * @param {{current: number, target: number, fraction: number}} options.progress
 * @param {string} [options.locale]
 */
export function badgeCard({ badge, earnedOn, progress, locale }) {
  const earned = earnedOn !== null;
  const tier = TIER_LABELS[badge.tier] ?? badge.tier;

  const progressText = `${formatCount(progress.current)} of ${progress.target} ${badge.unit}`;
  const status = earned ? `Earned ${dayShort(earnedOn, locale)}` : progressText;

  return el(
    'li',
    {
      class: `bw-card fo-badge${earned ? ' is-earned' : ' is-locked'}`,
      'data-tier': badge.tier,
      'aria-label': `${badge.title}, ${tier} badge, ${earned ? status : `locked, ${progressText}`}`,
    },
    [
      el('div', { class: 'fo-badge-medal', 'aria-hidden': 'true' }, [
        icon(badge.icon, { size: 22 }),
        !earned && el('span', { class: 'fo-badge-lock' }, [icon('lock', { size: 11 })]),
      ]),
      el('div', { class: 'fo-badge-body' }, [
        el('div', { class: 'fo-badge-top' }, [
          el('h3', { class: 'fo-badge-title', text: badge.title }),
          el('span', { class: 'bw-chip fo-badge-tier', text: tier }),
        ]),
        el('p', { class: 'fo-badge-desc', text: badge.description }),
        el('p', {
          class: 'fo-badge-status bw-num',
          text: earned ? status : `Locked \u00b7 ${status}`,
        }),
        !earned &&
          el('div', { class: 'bw-bar fo-badge-bar', 'aria-hidden': 'true' }, [
            el('div', {
              class: 'bw-bar-fill',
              style: `width: ${(progress.fraction * 100).toFixed(1)}%`,
            }),
          ]),
      ]),
    ],
  );
}

/** Whole numbers stay whole; fractions (hours) show one decimal. */
function formatCount(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
