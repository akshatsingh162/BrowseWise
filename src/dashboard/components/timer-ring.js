import { el } from '../../ui/dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgElement(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

/**
 * The circular progress display of the focus timer. It only shows what it is given; the
 * time itself is worked out from timestamps by the page.
 *
 * @param {{size?: number, stroke?: number}} [options]
 * @returns {{element: HTMLElement, update: (view: object) => void}}
 */
export function createTimerRing({ size = 232, stroke = 10 } = {}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const centre = size / 2;

  const track = svgElement('circle', {
    class: 'fo-ring-track',
    cx: centre,
    cy: centre,
    r: radius,
    fill: 'none',
    'stroke-width': stroke,
  });
  const progress = svgElement('circle', {
    class: 'fo-ring-progress',
    cx: centre,
    cy: centre,
    r: radius,
    fill: 'none',
    'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-dasharray': circumference,
    'stroke-dashoffset': circumference,
    transform: `rotate(-90 ${centre} ${centre})`,
  });
  const svg = svgElement('svg', {
    class: 'fo-ring-svg',
    viewBox: `0 0 ${size} ${size}`,
    width: size,
    height: size,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.append(track, progress);

  const phase = el('div', { class: 'fo-ring-phase' });
  const time = el('div', { class: 'fo-ring-time bw-num' });
  const note = el('div', { class: 'fo-ring-note' });

  const element = el('div', { class: 'fo-ring', role: 'timer', 'data-tone': 'idle' }, [
    svg,
    el('div', { class: 'fo-ring-text' }, [phase, time, note]),
  ]);

  return {
    element,
    /**
     * @param {object} view
     * @param {number} view.fraction  how far through the phase, 0 to 1
     * @param {string} view.timeText  "24:31"
     * @param {string} view.spokenTime "24 minutes 31 seconds"
     * @param {string} view.phaseText  "Focus"
     * @param {string} view.noteText   a short line under the time
     * @param {'idle'|'focus'|'break'|'paused'} view.tone
     */
    update({ fraction, timeText, spokenTime, phaseText, noteText, tone }) {
      const clamped = Math.min(1, Math.max(0, fraction));
      progress.setAttribute('stroke-dashoffset', String(circumference * (1 - clamped)));
      time.textContent = timeText;
      phase.textContent = phaseText;
      note.textContent = noteText;
      element.setAttribute('data-tone', tone);
      element.setAttribute(
        'aria-label',
        `${phaseText}: ${spokenTime} ${noteText ? `(${noteText})` : ''}`.trim(),
      );
    },
  };
}
