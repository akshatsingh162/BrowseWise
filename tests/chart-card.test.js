// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chartCard } from '../src/dashboard/components/chart-card.js';

const spec = {
  config: { type: 'bar', data: {}, options: {} },
  table: {
    columns: ['Day', 'Time'],
    rows: [
      ['Mon', '1h'],
      ['Tue', '2h'],
    ],
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('chartCard', () => {
  it('renders a titled card with an accessible canvas and a hidden data table', () => {
    const card = chartCard({
      title: 'Daily screen time',
      description: 'Last 7 days.',
      spec,
      createChart: vi.fn(),
    });

    const canvas = card.element.querySelector('canvas');
    expect(card.element.querySelector('h2').textContent).toBe('Daily screen time');
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('Daily screen time. Last 7 days.');

    const table = card.element.querySelector('table.bw-sr-only');
    expect(table.querySelector('caption').textContent).toBe('Daily screen time');
    expect([...table.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['Day', 'Time']);
    expect([...table.querySelectorAll('tbody tr')].map((tr) => tr.textContent)).toEqual([
      'Mon1h',
      'Tue2h',
    ]);
  });

  it('does not create the chart until mounted, then draws it with the canvas and config', () => {
    const chart = { destroy: vi.fn() };
    const createChart = vi.fn(() => chart);
    const card = chartCard({ title: 'T', description: 'D', spec, createChart });

    expect(createChart).not.toHaveBeenCalled();
    card.mount();
    expect(createChart).toHaveBeenCalledWith(card.element.querySelector('canvas'), spec.config);
  });

  it('destroys the chart once, and is safe to destroy twice or before mounting', () => {
    const chart = { destroy: vi.fn() };
    const card = chartCard({ title: 'T', description: 'D', spec, createChart: () => chart });

    expect(() => card.destroy()).not.toThrow();
    card.mount();
    card.destroy();
    card.destroy();
    expect(chart.destroy).toHaveBeenCalledTimes(1);
  });

  it('shows a message instead of crashing when the chart cannot be drawn', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const card = chartCard({
      title: 'T',
      description: 'D',
      spec,
      createChart: () => {
        throw new Error('no canvas context');
      },
    });

    expect(() => card.mount()).not.toThrow();
    expect(card.element.querySelector('[role="alert"]').textContent).toBe(
      'This chart could not be drawn.',
    );
    expect(card.element.querySelector('table')).not.toBeNull();
    expect(() => card.destroy()).not.toThrow();
  });

  it('never interprets data text as HTML', () => {
    const hostile = {
      config: spec.config,
      table: { columns: ['<b>x</b>'], rows: [['<img src=x onerror=alert(1)>']] },
    };
    const card = chartCard({ title: 'T', description: 'D', spec: hostile, createChart: vi.fn() });
    expect(card.element.querySelectorAll('img, b')).toHaveLength(0);
  });
});
